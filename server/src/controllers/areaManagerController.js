import prisma from '../config/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger, errorDetails } from '../config/logger.js';
import { createAuditLog } from '../services/auditService.js';
import { sGet, sSet, sInvalidate } from '../services/serverCache.js';
import { parseId, requireId } from '../utils/params.js';
import { VALID_SHRINKAGE_CATEGORIES } from '../utils/shrinkageCategories.js';
import { computeDifference } from '../utils/inventoryMath.js';

const AM_STORES_TTL = 60_000;

// Retry once on connection errors — Supabase drops idle connections after ~5 min
const RETRYABLE = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    const isConn = RETRYABLE.has(err.code) ||
      (err.message ?? '').toLowerCase().match(/connect|econnreset|socket/);
    if (!isConn) throw err;
    logger.warn('DB connection lost, reconnecting', errorDetails(err));
    await new Promise(r => setTimeout(r, 400));
    await prisma.$connect();
    return fn();
  }
}

// ── Helper: get all storeIds managed by this AM (cached per user) ─────────────
// Pass forceRefresh=true on write operations to bypass the 60-second cache
// and avoid stale authorization after a store is reassigned away from this AM.
async function getManagedStoreIds(areaManagerId, forceRefresh = false) {
  const key = `am:stores:${areaManagerId}`;
  if (!forceRefresh) {
    const cached = sGet(key);
    if (cached) return cached;
  }
  const stores = await prisma.store.findMany({
    where: { areaManagerId, isActive: true },
    select: { id: true },
  });
  const ids = stores.map(s => s.id);
  sSet(key, ids, AM_STORES_TTL);
  return ids;
}

// ── Dashboard overview ────────────────────────────────────────────────────────
export async function getDashboard(req, res, next) {
  try {
    const storeIds = await withRetry(() => getManagedStoreIds(req.user.id));

    const latestBatch = await withRetry(() => prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED', isDeleted: false },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    }));

    if (!storeIds.length || !latestBatch) {
      return res.json({ storeCount: storeIds.length, pendingReview: 0, approved: 0, returned: 0, latestBatch: null });
    }

    const [reviews, storeCounts, storeList] = await Promise.all([
      prisma.areaManagerReview.findMany({
        where: { batchId: latestBatch.id, areaManagerId: req.user.id },
        select: { storeId: true, status: true },
      }),
      // Per-store submitted/pending counts for the live progress view
      prisma.$queryRaw`
        SELECT "storeId"::int AS "storeId",
               COUNT(*)::int AS "total",
               COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END)::int AS "submitted",
               COUNT(CASE WHEN status = 'PENDING'   THEN 1 END)::int AS "pending"
        FROM "InventoryRecord"
        WHERE "batchId" = ${latestBatch.id} AND "storeId" = ANY(${storeIds})
        GROUP BY "storeId"
      `,
      prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, storeCode: true, storeName: true },
        orderBy: { storeCode: 'asc' },
      }),
    ]);

    const reviewMap   = new Map(reviews.map(r => [r.storeId, r.status]));
    const countMap    = new Map(storeCounts.map(r => [r.storeId, r]));

    const storeProgress = storeList.map(s => {
      const counts = countMap.get(s.id) ?? { total: 0, submitted: 0, pending: 0 };
      return {
        storeId:      s.id,
        storeCode:    s.storeCode,
        storeName:    s.storeName,
        total:        counts.total,
        submitted:    counts.submitted,
        pending:      counts.pending,
        reviewStatus: reviewMap.get(s.id) ?? null,
      };
    });

    res.json({
      storeCount:    storeIds.length,
      pendingReview: reviews.filter(r => r.status === 'PENDING_REVIEW').length,
      approved:      reviews.filter(r => r.status === 'APPROVED').length,
      returned:      reviews.filter(r => r.status === 'RETURNED').length,
      latestBatch,
      storeProgress,
    });
  } catch (error) { next(error); }
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function getNotifications(req, res, next) {
  try {
    const cacheKey = `am:notifications:${req.user.id}`;
    const cached = sGet(cacheKey);
    if (cached) return res.json(cached);

    const storeIds = await withRetry(() => getManagedStoreIds(req.user.id));
    if (!storeIds.length) {
      const empty = { items: [], count: 0 };
      sSet(cacheKey, empty, 30_000);
      return res.json(empty);
    }

    const now = new Date();
    const items = [];

    const latestBatch = await prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED', isDeleted: false },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });

    if (!latestBatch) {
      const empty = { items: [], count: 0 };
      sSet(cacheKey, empty, 30_000);
      return res.json(empty);
    }

    const dateLabel = new Date(latestBatch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    const [pendingReviews, pendingSubmissions] = await Promise.all([
      prisma.areaManagerReview.findMany({
        where: { batchId: latestBatch.id, areaManagerId: req.user.id, status: 'PENDING_REVIEW' },
        select: { storeId: true },
      }),
      prisma.inventoryRecord.findMany({
        where: { batchId: latestBatch.id, storeId: { in: storeIds }, status: 'PENDING' },
        select: { storeId: true },
        distinct: ['storeId'],
      }),
    ]);

    if (pendingReviews.length > 0) {
      items.push({
        type: 'review',
        message: `${pendingReviews.length} store${pendingReviews.length > 1 ? 's' : ''} waiting for your review — ${dateLabel}`,
        batchId: latestBatch.id,
        urgent: true,
      });
    }

    if (pendingSubmissions.length > 0 && latestBatch.submissionDeadline) {
      const hoursLeft = Math.round((new Date(latestBatch.submissionDeadline) - now) / 3600000);
      if (hoursLeft > 0 && hoursLeft <= 24) {
        items.push({
          type: 'deadline',
          message: `${pendingSubmissions.length} store${pendingSubmissions.length > 1 ? 's' : ''} not yet submitted — deadline in ${hoursLeft}h`,
          batchId: latestBatch.id,
          urgent: hoursLeft <= 6,
        });
      }
    }

    const result = { items, count: items.length };
    sSet(cacheKey, result, 30_000);
    res.json(result);
  } catch (error) { next(error); }
}

// ── All batches for AM's stores ───────────────────────────────────────────────
export async function getBatches(req, res, next) {
  try {
    const cacheKey = `am:batches:${req.user.id}`;
    const cached = sGet(cacheKey);
    if (cached) return res.json(cached);

    const storeIds = await withRetry(() => getManagedStoreIds(req.user.id));
    if (!storeIds.length) {
      sSet(cacheKey, [], 60_000);
      return res.json([]);
    }

    const batches = await prisma.uploadBatch.findMany({
      where: {
        status: 'COMPLETED',
        isDeleted: false,
        inventoryRecords: { some: { storeId: { in: storeIds } } },
      },
      orderBy: { inventoryDate: 'desc' },
      select: {
        id: true, inventoryDate: true, submissionDeadline: true, uploadedAt: true,
        amReviews: {
          where: { storeId: { in: storeIds } },
          select: { storeId: true, status: true },
        },
      },
    });

    // Which statuses each store has in each cycle. Nesting this as an
    // `inventoryRecords` select with `distinct: ['storeId','status']` cannot be pushed
    // into SQL, so it dragged every inventory row for every managed store across every
    // cycle into the query engine to derive at most two statuses per store. groupBy
    // does the deduplication in Postgres and returns only the distinct triples.
    const batchIds = batches.map(b => b.id);
    const statusRows = batchIds.length > 0
      ? await prisma.inventoryRecord.groupBy({
          by: ['batchId', 'storeId', 'status'],
          where: { batchId: { in: batchIds }, storeId: { in: storeIds } },
          _count: true,
        })
      : [];

    // batchId -> storeId -> Set of statuses present
    const statusesByBatch = new Map();
    for (const row of statusRows) {
      let byStore = statusesByBatch.get(row.batchId);
      if (!byStore) { byStore = new Map(); statusesByBatch.set(row.batchId, byStore); }
      let statuses = byStore.get(row.storeId);
      if (!statuses) { statuses = new Set(); byStore.set(row.storeId, statuses); }
      statuses.add(row.status);
    }

    const result = batches.map(b => {
      const byStore = statusesByBatch.get(b.id);
      const storeStatuses = storeIds.map(sid => {
        const review = b.amReviews.find(r => r.storeId === sid);
        const statuses = byStore?.get(sid);
        // status is a two-value enum, so "every record is SUBMITTED" is exactly
        // "SUBMITTED is present and PENDING is not" — same result as the previous
        // .every() over the distinct rows.
        const allSubmitted = !!statuses && statuses.has('SUBMITTED') && !statuses.has('PENDING');
        const allPending   = !!statuses && statuses.has('PENDING')   && !statuses.has('SUBMITTED');
        return {
          storeId: sid,
          reviewStatus: review?.status || null,
          submitted: allSubmitted,
          pending: allPending,
          // A store with no rows in this cycle simply wasn't part of it — it is
          // neither submitted nor outstanding, so it must not inflate the counts.
          inBatch: !!statuses,
        };
      });
      const storesInBatch = storeStatuses.filter(s => s.inBatch);

      return {
        id: b.id,
        inventoryDate: b.inventoryDate,
        submissionDeadline: b.submissionDeadline,
        uploadedAt: b.uploadedAt,
        pendingReview:  storeStatuses.filter(s => s.reviewStatus === 'PENDING_REVIEW').length,
        approved:       storeStatuses.filter(s => s.reviewStatus === 'APPROVED').length,
        returned:       storeStatuses.filter(s => s.reviewStatus === 'RETURNED').length,
        notSubmitted:   storesInBatch.filter(s => s.submitted === false && s.reviewStatus === null).length,
        totalStores:    storesInBatch.length,
      };
    });

    sSet(cacheKey, result, 60_000);
    res.json(result);
  } catch (error) { next(error); }
}

// ── Stores summary for one batch ──────────────────────────────────────────────
export async function getBatchStores(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');

    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.length) return res.json([]);

    const [stores, reviewList, recordCounts] = await Promise.all([
      prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, storeCode: true, storeName: true },
      }),
      prisma.areaManagerReview.findMany({
        where: { batchId, storeId: { in: storeIds }, batch: { isDeleted: false } },
        select: { storeId: true, status: true, remarks: true, reviewedAt: true },
      }),
      prisma.inventoryRecord.groupBy({
        by: ['storeId', 'status'],
        where: { batchId, storeId: { in: storeIds }, batch: { isDeleted: false } },
        _count: true,
      }),
    ]);

    // O(1) lookup maps instead of O(n) .find() per store
    const reviewByStore = new Map(reviewList.map(r => [r.storeId, r]));
    const countsByStore = new Map();
    for (const r of recordCounts) {
      if (!countsByStore.has(r.storeId)) countsByStore.set(r.storeId, { PENDING: 0, SUBMITTED: 0 });
      countsByStore.get(r.storeId)[r.status] = r._count;
    }

    const result = stores.map(store => {
      const review   = reviewByStore.get(store.id);
      const counts   = countsByStore.get(store.id) ?? { PENDING: 0, SUBMITTED: 0 };
      const pending   = counts.PENDING;
      const submitted = counts.SUBMITTED;
      const total     = pending + submitted;
      return {
        ...store,
        total, pending, submitted,
        allSubmitted: total > 0 && submitted === total,
        reviewStatus:  review?.status   || null,
        reviewRemarks: review?.remarks  || null,
        reviewedAt:    review?.reviewedAt || null,
      };
    });

    res.json(result);
  } catch (error) { next(error); }
}

// ── Records for a specific store+batch ────────────────────────────────────────
export async function getStoreRecords(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');
    const storeId = requireId(req.params.storeId, 'storeId');

    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.includes(storeId)) throw new AppError('This store is not assigned to you', 403);

    const [records, review, store] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where: { batchId, storeId, batch: { isDeleted: false } },
        orderBy: { materialCode: 'asc' },
        select: {
          id: true, materialCode: true, materialName: true,
          systemQuantity: true, physicalQuantity: true, difference: true,
          remarks: true, shrinkageCategory: true, status: true,
        },
      }),
      prisma.areaManagerReview.findUnique({
        where: { batchId_storeId: { batchId, storeId } },
        select: { status: true, remarks: true, reviewedAt: true },
      }),
      prisma.store.findUnique({ where: { id: storeId }, select: { storeCode: true, storeName: true } }),
    ]);

    res.json({ records, review, store });
  } catch (error) { next(error); }
}

// ── AM edits a single record ──────────────────────────────────────────────────
export async function updateRecord(req, res, next) {
  try {
    const id = requireId(req.params.id, 'record ID');

    // batch.isDeleted guard mirrors getStoreRecords — a review tab opened before the
    // admin deleted the cycle must not keep writing counts into it.
    const record = await prisma.inventoryRecord.findFirst({
      where: { id, batch: { isDeleted: false } },
      select: { storeId: true, batchId: true, status: true, systemQuantity: true },
    });
    if (!record) throw new AppError('This inventory record was not found', 404);
    if (record.status !== 'SUBMITTED') throw new AppError('Only records that have been submitted by the store can be edited at this stage', 400);

    // Force a fresh DB lookup — bypasses the 60 s cache so a recently
    // unassigned store is immediately denied even within the cache window.
    const storeIds = await getManagedStoreIds(req.user.id, true);
    if (!storeIds.includes(record.storeId)) throw new AppError('This store is not assigned to you', 403);

    const { physicalQuantity, remarks, shrinkageCategory } = req.body;
    const updateData = {};
    if (physicalQuantity !== undefined) {
      // Clearing the field is a legitimate edit — the store controller accepts it
      // too, and the review UI sends null when the input is emptied.
      if (physicalQuantity === null || physicalQuantity === '') {
        updateData.physicalQuantity = null;
        updateData.difference = null;
      } else {
        const qty = parseFloat(physicalQuantity);
        if (isNaN(qty) || qty < 0) throw new AppError('Physical count must be zero or a positive number', 400);
        updateData.physicalQuantity = qty;
        updateData.difference = computeDifference(qty, record.systemQuantity);
      }
    }
    if (remarks !== undefined)           updateData.remarks = remarks || null;
    if (shrinkageCategory !== undefined) {
      if (shrinkageCategory && !VALID_SHRINKAGE_CATEGORIES.has(shrinkageCategory)) {
        throw new AppError('Invalid shrinkage category', 400);
      }
      updateData.shrinkageCategory = shrinkageCategory || null;
    }

    const updated = await prisma.inventoryRecord.update({ where: { id }, data: updateData });

    createAuditLog({
      userId: req.user.id,
      action: 'AM_EDIT_RECORD',
      entityType: 'INVENTORY_RECORD',
      entityId: id,
      metadata: { batchId: record.batchId, storeId: record.storeId, changes: updateData },
    }).catch(() => {});

    // An AM edit changes the numbers admins and the store see, so the cached
    // dashboards have to go with it — approve/return already do this.
    sInvalidate(
      'admin:dashboard',
      `am:batches:${req.user.id}`,
      `store:dashboard:${record.storeId}`,
    );

    res.json(updated);
  } catch (error) { next(error); }
}

// ── Approve a store's submission ──────────────────────────────────────────────
export async function approveStore(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');
    const storeId = requireId(req.params.storeId, 'storeId');

    const storeIds = await getManagedStoreIds(req.user.id, true); // forceRefresh — no stale auth on write
    if (!storeIds.includes(storeId)) throw new AppError('This store is not assigned to you', 403);

    // A review tab opened before the admin deleted the cycle must not be able to
    // approve into it — mirrors the batch.isDeleted guard on updateRecord/getStoreRecords.
    const batchRow = await prisma.uploadBatch.findFirst({ 
      where: { id: batchId, isDeleted: false }, 
      select: { id: true, inventoryDate: true } 
    });
    if (!batchRow) throw new AppError('This inventory cycle no longer exists', 404);

    // NEW: Area Manager can only approve TODAY's or YESTERDAY's inventory cycle
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const cycleDate = new Date(batchRow.inventoryDate);
    cycleDate.setHours(0, 0, 0, 0);
    
    // Allow approval if cycle is today or yesterday (submission day + next day)
    if (cycleDate.getTime() !== today.getTime() && cycleDate.getTime() !== yesterday.getTime()) {
      throw new AppError('You can only approve submissions from today or yesterday. This cycle is for ' + cycleDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 403);
    }

    // Server-side guard: all records must be submitted before an AM can approve.
    // The UI checks allSubmitted, but a direct API call could bypass that.
    const pendingCount = await prisma.inventoryRecord.count({
      where: { batchId, storeId, status: 'PENDING' },
    });
    if (pendingCount > 0) {
      throw new AppError(
        `${pendingCount} item${pendingCount > 1 ? 's are' : ' is'} still pending submission from the store manager. All items must be submitted before you can approve`,
        400
      );
    }

    const { remarks } = req.body;

    const [review, storeRow] = await Promise.all([
      prisma.areaManagerReview.upsert({
        where: { batchId_storeId: { batchId, storeId } },
        create: { batchId, storeId, areaManagerId: req.user.id, status: 'APPROVED', remarks: remarks || null, reviewedAt: new Date() },
        update: { status: 'APPROVED', remarks: remarks || null, reviewedAt: new Date() },
      }),
      prisma.$queryRaw`SELECT "storeCode", "storeName" FROM "Store" WHERE id = ${storeId} LIMIT 1`,
    ]);
    const storeMeta = storeRow[0] ?? {};

    createAuditLog({ userId: req.user.id, action: 'AM_APPROVE', entityType: 'STORE', entityId: storeId, metadata: { batchId, storeCode: storeMeta.storeCode, storeName: storeMeta.storeName, remarks } }).catch(() => {});
    sInvalidate('admin:dashboard', `am:batches:${req.user.id}`, `am:notifications:${req.user.id}`);

    // Notify all admins — reuse storeMeta already fetched above, only fetch admins + batch
    const storeMeta_ = { storeName: storeMeta.storeName, storeCode: storeMeta.storeCode };
    Promise.all([
      prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, pendingApproval: false, NOT: { email: null } }, select: { email: true, name: true } }),
      prisma.uploadBatch.findUnique({ where: { id: batchId }, select: { inventoryDate: true } }),
    ]).then(async ([admins, batch]) => {
      if (!admins.length || !batch) return;
      const { sendAMApprovalEmail } = await import('../services/emailService.js');
      for (const admin of admins) {
        sendAMApprovalEmail({ adminEmail: admin.email, adminName: admin.name, store: storeMeta_, areaManagerName: req.user.name, batchDate: new Date(batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), remarks: remarks || null })
          .catch(e => logger.error('AM approval email error', errorDetails(e)));
      }
    }).catch(e => logger.error('AM approval notify error', errorDetails(e)));

    res.json({ ok: true, review });
  } catch (error) { next(error); }
}

// ── Return store submission for recount ───────────────────────────────────────
export async function returnStore(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');
    const storeId = requireId(req.params.storeId, 'storeId');

    const storeIds = await getManagedStoreIds(req.user.id, true); // forceRefresh — no stale auth on write
    if (!storeIds.includes(storeId)) throw new AppError('This store is not assigned to you', 403);

    // A review tab opened before the admin deleted the cycle must not be able to
    // reset records in it — mirrors the batch.isDeleted guard on updateRecord/getStoreRecords.
    const batchRow = await prisma.uploadBatch.findFirst({ where: { id: batchId, isDeleted: false }, select: { id: true } });
    if (!batchRow) throw new AppError('This inventory cycle no longer exists', 404);

    const { remarks } = req.body;
    if (!remarks?.trim()) throw new AppError('Please provide a reason so the store manager knows what to correct', 400);

    // Mirror of the approve guard: there must be something to send back. Without this
    // a second return call wipes nothing but still flips the review to RETURNED,
    // re-alerting a store that has already been sent its recount.
    const submittedCount = await prisma.inventoryRecord.count({
      where: { batchId, storeId, status: 'SUBMITTED' },
    });
    if (submittedCount === 0) {
      throw new AppError('This store has no submitted items to return', 400);
    }

    await prisma.$transaction([
      // Reset submitted records fully — clears all count data so store must re-enter
      prisma.inventoryRecord.updateMany({
        where: { batchId, storeId, status: 'SUBMITTED' },
        data: {
          status:            'PENDING',
          physicalQuantity:  null,
          difference:        null,
          shrinkageCategory: null,
          remarks:           null,
          isRepeat:          false, // re-evaluated when the store re-submits
          submittedBy:       null,
          submittedAt:       null,
        },
      }),
      // Mark the review as returned
      prisma.areaManagerReview.upsert({
        where: { batchId_storeId: { batchId, storeId } },
        create: { batchId, storeId, areaManagerId: req.user.id, status: 'RETURNED', remarks: remarks.trim(), reviewedAt: new Date() },
        update: { status: 'RETURNED', remarks: remarks.trim(), reviewedAt: new Date() },
      }),
    ]);

    const retStoreRow = await prisma.$queryRaw`SELECT "storeCode", "storeName" FROM "Store" WHERE id = ${storeId} LIMIT 1`;
    const retStore = retStoreRow[0] ?? {};
    createAuditLog({ userId: req.user.id, action: 'AM_RETURN', entityType: 'STORE', entityId: storeId, metadata: { batchId, storeCode: retStore.storeCode, storeName: retStore.storeName, reason: remarks } }).catch(() => {});
    // Invalidate both notification and dashboard caches for the store
    sInvalidate(
      'admin:dashboard',
      `am:batches:${req.user.id}`,
      `am:notifications:${req.user.id}`,
      `store:notifications:${storeId}`,
      `store:dashboard:${storeId}`,
    );

    res.json({ ok: true });
  } catch (error) { next(error); }
}

// ── Admin: batch-assign multiple stores to one area manager ───────────────────
export async function batchAssignAMStores(req, res, next) {
  try {
    const amId     = requireId(req.params.amId, 'area manager ID');
    const storeIds = req.body.storeIds ?? [];
    if (!Array.isArray(storeIds)) throw new AppError('storeIds must be an array', 400);
    if (storeIds.length > 100) throw new AppError('Cannot assign more than 100 stores at once', 400);

    // Validate every storeId is a clean positive integer
    const parsedStoreIds = storeIds.map((sid, i) => {
      const n = parseInt(sid, 10);
      if (isNaN(n) || n < 1) throw new AppError(`Invalid storeId at index ${i}`, 400);
      return n;
    });

    const rows = await prisma.$queryRaw`SELECT role FROM "User" WHERE id = ${amId} LIMIT 1`;
    if (!rows.length || rows[0].role !== 'AREA_MANAGER') throw new AppError('User is not an Area Manager', 400);

    // Capture old AM assignments before update so we can bust their caches too
    const oldStores = await prisma.store.findMany({
      where: { id: { in: parsedStoreIds }, areaManagerId: { not: null } },
      select: { areaManagerId: true },
    });
    const prevAmIds = [...new Set(oldStores.map(s => s.areaManagerId).filter(id => id && id !== amId))];

    // The payload is the AM's full store list, not an addition to it — stores this
    // AM currently holds but that are absent from the list must be released,
    // otherwise there is no way to unassign a store from the edit screen.
    const removedIds = (await prisma.store.findMany({
      where: { areaManagerId: amId, id: { notIn: parsedStoreIds } },
      select: { id: true },
    })).map(s => s.id);

    try {
      await prisma.$transaction([
        ...(removedIds.length
          ? [prisma.store.updateMany({ where: { id: { in: removedIds } }, data: { areaManagerId: null } })]
          : []),
        ...parsedStoreIds.map(sid => prisma.store.update({ where: { id: sid }, data: { areaManagerId: amId } })),
      ]);
    } catch (txErr) {
      if (txErr.code === 'P2025') throw new AppError('One or more stores not found', 404);
      throw txErr;
    }

    // Bust new AM's cache and all previously-managing AMs' caches
    sInvalidate('admin:dashboard', 'admin:stores', `am:stores:${amId}`, ...prevAmIds.map(id => `am:stores:${id}`));
    createAuditLog({ userId: req.user.id, action: 'BATCH_ASSIGN_AREA_MANAGER', entityType: 'STORE', entityId: amId, metadata: { storeIds: parsedStoreIds, unassignedStoreIds: removedIds, areaManagerId: amId } }).catch(() => {});
    res.json({ assigned: parsedStoreIds.length, unassigned: removedIds.length });
  } catch (error) { next(error); }
}

// ── Admin: assign a store to an area manager ──────────────────────────────────
export async function assignStoreAM(req, res, next) {
  try {
    const storeId = requireId(req.params.storeId, 'store ID');
    // parseId returns undefined for null/undefined/'' — all of which mean "unassign"
    const amId = parseId(req.body.areaManagerId, 'areaManagerId') ?? null;

    if (amId !== null) {
      const rows = await prisma.$queryRaw`
        SELECT role FROM "User" WHERE id = ${amId} LIMIT 1
      `;
      if (!rows.length || rows[0].role !== 'AREA_MANAGER') throw new AppError('User is not an Area Manager', 400);
    }

    // Fetch old areaManagerId BEFORE the update so we can bust the previous AM's cache.
    // Reading it from the update result gives the NEW value, not the old one.
    const oldStore = await prisma.store.findUnique({ where: { id: storeId }, select: { areaManagerId: true } });
    if (!oldStore) throw new AppError('Store not found', 404);
    const prevAmId = oldStore.areaManagerId;

    const [store, amUser] = await Promise.all([
      prisma.store.update({
        where: { id: storeId },
        data: { areaManagerId: amId },
        select: { id: true, storeCode: true, storeName: true, areaManagerId: true },
      }),
      amId
        ? prisma.$queryRaw`SELECT "employeeId", name FROM "User" WHERE id = ${amId} LIMIT 1`
        : Promise.resolve([]),
    ]);
    const am = amUser[0] ?? null;

    // Bust new AM's cache so getManagedStoreIds reflects the new assignment immediately
    if (amId) sInvalidate(`am:stores:${amId}`);
    // Bust old AM's cache — prevAmId is the value BEFORE the update
    if (prevAmId && prevAmId !== amId) sInvalidate(`am:stores:${prevAmId}`);
    // Dashboard scorecard and the store list both show the assignment — bust both
    sInvalidate('admin:dashboard', 'admin:stores');

    createAuditLog({ userId: req.user.id, action: 'ASSIGN_AREA_MANAGER', entityType: 'STORE', entityId: storeId, metadata: { storeCode: store.storeCode, storeName: store.storeName, areaManagerId: amId, areaManagerName: am?.name ?? null } }).catch(() => {});
    res.json(store);
  } catch (error) { next(error); }
}

// ── Admin: list all area managers ─────────────────────────────────────────────
export async function getAreaManagers(req, res, next) {
  try {
    // Use raw SQL — Prisma DLL may not recognise AREA_MANAGER until regenerated
    const ams = await prisma.$queryRaw`
      SELECT
        u.id, u."employeeId", u.name, u.email,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', s.id, 'storeCode', s."storeCode", 'storeName', s."storeName")
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'::json
        ) AS "managedStores"
      FROM "User" u
      LEFT JOIN "Store" s ON s."areaManagerId" = u.id
      WHERE u.role::text = 'AREA_MANAGER' AND u."isActive" = true
      GROUP BY u.id, u."employeeId", u.name, u.email
      ORDER BY u.name ASC
    `;
    res.json(ams);
  } catch (error) { next(error); }
}
