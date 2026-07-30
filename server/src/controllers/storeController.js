import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import prisma from '../config/prisma.js';
import { parseId, requireId, parsePage, parsePageSize } from '../utils/params.js';
import { sGet, sSet, sInvalidate } from '../services/serverCache.js';
import { VALID_SHRINKAGE_CATEGORIES } from '../utils/shrinkageCategories.js';
import { buildInventoryWorkbook } from '../utils/excelExport.js';

const EMPTY_STATS = { totalItems: 0, pendingItems: 0, submittedItems: 0, matchedItems: 0, shortageItems: 0, excessItems: 0 };

// A per-store deadline extension (if one exists) overrides the batch's default submissionDeadline.
function effectiveDeadline(batchLike) {
  const extension = batchLike?.deadlineExtensions?.[0] ?? null;
  return extension ? extension.newDeadline : (batchLike?.submissionDeadline ?? null);
}

export async function getDashboard(req, res, next) {
  const startTime = Date.now();
  try {
    const storeId = req.user.storeId;

    if (!req.user.store) {
      throw new AppError('Your account is not linked to a store. Please contact your administrator', 403);
    }

    const cacheKey = `store:dashboard:${storeId}`;
    const cached = sGet(cacheKey);
    if (cached) return res.json(cached);

    // Get latest batch WHERE this store has inventory records
    const [latestBatch, allPendingBatches] = await Promise.all([
      prisma.uploadBatch.findFirst({
        where: { isDeleted: false, inventoryRecords: { some: { storeId } } },
        orderBy: { inventoryDate: 'desc' },
        select: {
          id: true,
          inventoryDate: true,
          uploadedAt: true,
          submissionDeadline: true,
          deadlineExtensions: {
            where: { storeId },
            select: { newDeadline: true },
            take: 1,
          },
        },
      }),
      // All batches that still have PENDING records — surfaces past-date uploads
      prisma.uploadBatch.findMany({
        where: { isDeleted: false, inventoryRecords: { some: { storeId, status: 'PENDING' } } },
        orderBy: { inventoryDate: 'desc' },
        select: { id: true, inventoryDate: true },
      }),
    ]);

    if (!latestBatch) {
      const emptyResult = { store: req.user.store, batch: null, stats: EMPTY_STATS, olderPendingBatches: [] };
      sSet(cacheKey, emptyResult, 60_000);
      return res.json(emptyResult);
    }

    // Aggregate stats for the latest batch
    const stats = await prisma.$queryRaw`
      SELECT
        COUNT(*)::int as "totalItems",
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int as "pendingItems",
        COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END)::int as "submittedItems",
        COUNT(CASE WHEN difference = 0 AND status = 'SUBMITTED' THEN 1 END)::int as "matchedItems",
        COUNT(CASE WHEN difference < 0 AND status = 'SUBMITTED' THEN 1 END)::int as "shortageItems",
        COUNT(CASE WHEN difference > 0 AND status = 'SUBMITTED' THEN 1 END)::int as "excessItems"
      FROM "InventoryRecord"
      WHERE "storeId" = ${storeId} AND "batchId" = ${latestBatch.id}
    `;

    // Older batches that still need the manager's attention (not the latest one)
    const olderPendingBatches = allPendingBatches.filter(b => b.id !== latestBatch.id);

    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] GET_STORE_DASHBOARD: ${duration}ms`);

    // Report the deadline this store is actually held to, so the dashboard does not
    // tell a store with a granted extension that the cycle is locked.
    const { deadlineExtensions: _ext, ...batchFields } = latestBatch;
    const result = {
      store: req.user.store,
      batch: { ...batchFields, submissionDeadline: effectiveDeadline(latestBatch) },
      stats: stats[0] ?? EMPTY_STATS,
      olderPendingBatches,
    };
    sSet(cacheKey, result, 60_000);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getBatches(req, res, next) {
  const startTime = Date.now();
  try {
    const storeId = req.user.storeId;

    // Get all batches with aggregated counts using a single optimized query
    const batches = await prisma.$queryRaw`
      SELECT
        b.id,
        b."inventoryDate",
        b."uploadedAt",
        COUNT(ir.id)::int as "totalRecords",
        COUNT(CASE WHEN ir.status = 'PENDING' THEN 1 END)::int as "pendingCount",
        COUNT(CASE WHEN ir.status = 'SUBMITTED' THEN 1 END)::int as "submittedCount"
      FROM "UploadBatch" b
      INNER JOIN "InventoryRecord" ir ON ir."batchId" = b.id AND ir."storeId" = ${storeId}
      WHERE b."isDeleted" = false
      GROUP BY b.id, b."inventoryDate", b."uploadedAt"
      ORDER BY b."inventoryDate" DESC
    `;

    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] GET_BATCHES (${batches.length} batches): ${duration}ms`);

    res.json(batches);
  } catch (error) {
    next(error);
  }
}

export async function getInventory(req, res, next) {
  const startTime = Date.now();
  try {
    const storeId    = req.user.storeId;
    const { search, status } = req.query;
    const batchId    = parseId(req.query.batchId, 'batchId');
    const pageNum    = parsePage(req.query.page, 1);
    const pageSizeNum = parsePageSize(req.query.pageSize, 100, 500);

    const where = { storeId };

    if (batchId) {
      where.batchId = batchId;
    }

    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      if (!new Set(['PENDING', 'SUBMITTED']).has(status)) throw new AppError('Invalid status filter', 400);
      where.status = status;
    }

    const skip = (pageNum - 1) * pageSizeNum;

    // Batch-wide readiness, deliberately ignoring search/status/page. The client's
    // progress bar and pre-submit checks have to describe the whole cycle — scoping
    // them to the current page tells a 250-item store it is "100% complete · 0 blank"
    // and then lets the server reject the submission.
    const readinessQuery = batchId
      ? prisma.$queryRaw`
          SELECT
            COUNT(*)::int AS "totalPending",
            COUNT(CASE WHEN "physicalQuantity" IS NULL THEN 1 END)::int AS "missingPhysical",
            COUNT(CASE WHEN "difference" IS NOT NULL AND "difference" <> 0
                        AND ("shrinkageCategory" IS NULL OR "shrinkageCategory" = '')
                       THEN 1 END)::int AS "missingCategory",
            COUNT(CASE WHEN "difference" IS NOT NULL AND "difference" <> 0
                        AND ("remarks" IS NULL OR TRIM("remarks") = '')
                       THEN 1 END)::int AS "missingDetail"
          FROM "InventoryRecord"
          WHERE "storeId" = ${storeId} AND "batchId" = ${batchId} AND status = 'PENDING'
        `.then(rows => rows[0] ?? null).catch(() => null)
      : Promise.resolve(null);

    const [totalRecords, records, batchInfo, amReview, readiness] = await Promise.all([
      prisma.inventoryRecord.count({ where }),
      prisma.inventoryRecord.findMany({
        where,
        orderBy: { materialCode: 'asc' },
        skip,
        take: pageSizeNum,
      }),
      batchId
        ? prisma.uploadBatch.findUnique({
            where: { id: batchId },
            select: {
              submissionDeadline: true,
              deadlineExtensions: {
                where: { storeId },
                select: { newDeadline: true },
                take: 1,
              },
            },
          })
        : Promise.resolve(null),
      batchId
        ? prisma.$queryRaw`
            SELECT status, remarks FROM "AreaManagerReview"
            WHERE "batchId" = ${batchId} AND "storeId" = ${storeId}
            LIMIT 1
          `.then(rows => rows[0] ?? null).catch(() => null)
        : Promise.resolve(null),
      readinessQuery,
    ]);

    // C2: Check for per-store deadline extension override (fetched inline with batchInfo)
    const deadline = effectiveDeadline(batchInfo);
    const isLocked = deadline ? new Date() > new Date(deadline) : false;

    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] GET_INVENTORY (${records.length} records): ${duration}ms`);

    res.json({
      records,
      isLocked,
      returnedByAM: amReview?.status === 'RETURNED' ? amReview.remarks || 'Your submission was returned. Please recount and resubmit.' : null,
      readiness,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSizeNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateInventoryRecord(req, res, next) {
  const startTime = Date.now();
  try {
    const recordId = requireId(req.params.id, 'recordId');
    const storeId = req.user.storeId;
    // systemQuantity is the ground truth from the admin's uploaded reconciliation
    // file and is intentionally NOT store-editable — the store is the party being
    // audited for shrinkage, so letting it rewrite the number its count is measured
    // against would let it erase any discrepancy it introduced. Only admins can
    // correct systemQuantity, and only via a fresh upload (there is no override path
    // for it either — see adminController.overrideInventoryRecord).
    const { physicalQuantity: rawPhys, remarks, shrinkageCategory } = req.body;

    const physicalProvided = rawPhys !== undefined;

    const physicalQuantity = physicalProvided ? ((rawPhys === '' || rawPhys === null) ? null : rawPhys) : undefined;

    if (physicalProvided && physicalQuantity !== null) {
      const qty = parseFloat(physicalQuantity);
      if (isNaN(qty) || qty < 0) throw new AppError('Physical count must be zero or a positive number', 400);
    }
    if (shrinkageCategory !== undefined && shrinkageCategory && !VALID_SHRINKAGE_CATEGORIES.has(shrinkageCategory)) {
      throw new AppError('Invalid shrinkage category', 400);
    }

    // Single query: ownership + current values + deadline + extension — no second round-trip
    const record = await prisma.inventoryRecord.findFirst({
      where: { id: recordId, storeId },
      select: {
        id: true,
        systemQuantity: true,
        physicalQuantity: true,
        status: true,
        batchId: true,
        batch: {
          select: {
            submissionDeadline: true,
            deadlineExtensions: {
              where: { storeId },
              select: { newDeadline: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!record) throw new AppError('This inventory item was not found', 404);
    if (record.status === 'SUBMITTED') throw new AppError('This item has already been submitted and cannot be edited', 403);

    if (record.batch?.submissionDeadline) {
      const deadline = effectiveDeadline(record.batch);
      if (new Date() > new Date(deadline)) {
        throw new AppError('This cycle is now closed — the submission deadline has passed. Contact your administrator if you need an extension', 403);
      }
    }

    // When physicalQuantity is explicitly cleared (null), effectivePhysQty is null.
    // Falling back to record.physicalQuantity only when the field was NOT sent at all.
    const effectivePhysQty = physicalProvided
      ? (physicalQuantity !== null ? parseFloat(physicalQuantity) : null)
      : record.physicalQuantity;

    let difference = undefined;
    if (physicalProvided) {
      difference = effectivePhysQty !== null && effectivePhysQty !== undefined
        ? parseFloat((effectivePhysQty - record.systemQuantity).toFixed(4))
        : null;
    }

    const result = await prisma.inventoryRecord.update({
      where: { id: recordId },
      data: {
        physicalQuantity: physicalProvided ? effectivePhysQty : undefined,
        difference,
        remarks:           remarks           !== undefined ? remarks                       : undefined,
        shrinkageCategory: shrinkageCategory !== undefined ? (shrinkageCategory || null)   : undefined,
      },
    });

    createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: recordId,
      metadata: { systemQuantity: record.systemQuantity, physicalQuantity: effectivePhysQty, remarks },
    }).catch(err => console.error('[audit] UPDATE_INVENTORY log failed:', err.message));

    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] UPDATE_INVENTORY record ${recordId}: ${duration}ms`);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function submitInventory(req, res, next) {
  try {
    const storeId = req.user.storeId;
    const parsedBatchId = requireId(req.body.batchId, 'batchId');
    const submittedAt   = new Date();

    // Enforce deadline — same logic as updateInventoryRecord.
    // Without this check, a store manager could bypass the lock by POSTing
    // directly to /store/inventory/submit after the deadline passed.
    // Fetch deadline + any per-store extension in one query
    const batchForDeadline = await prisma.uploadBatch.findUnique({
      where: { id: parsedBatchId },
      select: {
        submissionDeadline: true,
        deadlineExtensions: {
          where: { storeId },
          select: { newDeadline: true },
          take: 1,
        },
      },
    });
    if (!batchForDeadline) throw new AppError('This inventory cycle was not found', 404);
    if (batchForDeadline.submissionDeadline) {
      const deadline = effectiveDeadline(batchForDeadline);
      if (new Date() > new Date(deadline)) {
        throw new AppError('This cycle is now closed — the submission deadline has passed. Contact your administrator if you need an extension', 403);
      }
    }

    // Serializable isolation prevents two concurrent submissions from both
    // reading the same PENDING rows. PostgreSQL aborts one with P2034 if it
    // detects a write-write conflict, making this concurrency-safe.
    let txResult;
    try {
      txResult = await prisma.$transaction(async (tx) => {
        const pending = await tx.inventoryRecord.findMany({
          where: { storeId, batchId: parsedBatchId, status: 'PENDING' },
        });

        if (pending.length === 0) throw new AppError('No items are waiting for submission in this cycle', 400);

        const missingPhysical = pending.filter(r => r.physicalQuantity === null);
        if (missingPhysical.length > 0) {
          throw new AppError(
            `${missingPhysical.length} item${missingPhysical.length > 1 ? 's are' : ' is'} missing a physical count. Please enter a count for every item before submitting`,
            400
          );
        }

        const discrepant = pending.filter(r => r.difference !== null && r.difference !== 0);
        const missingCategory = discrepant.filter(r => !r.shrinkageCategory);
        if (missingCategory.length > 0) {
          throw new AppError(
            `${missingCategory.length} item${missingCategory.length > 1 ? 's have' : ' has'} a discrepancy but no category selected. Please choose a category for each discrepancy`,
            400
          );
        }
        const missingDetail = discrepant.filter(r => !r.remarks || r.remarks.trim() === '');
        if (missingDetail.length > 0) {
          throw new AppError(
            `${missingDetail.length} item${missingDetail.length > 1 ? 's have' : ' has'} a discrepancy but no issue detail entered. Please describe each discrepancy before submitting`,
            400
          );
        }

        const { count } = await tx.inventoryRecord.updateMany({
          where: { storeId, batchId: parsedBatchId, status: 'PENDING' },
          data: { status: 'SUBMITTED', submittedBy: req.user.id, submittedAt },
        });

        return {
          count,
          records: pending
            .map(r => ({ ...r, status: 'SUBMITTED', submittedBy: req.user.id, submittedAt }))
            .sort((a, b) => (a.difference ?? 0) - (b.difference ?? 0)),
        };
      }, { isolationLevel: 'Serializable' });
    } catch (txErr) {
      if (txErr?.code === 'P2034') {
        throw new AppError('This inventory has already been submitted. Refresh the page to see the latest status', 409);
      }
      throw txErr;
    }

    const { count, records } = txResult;

    // Bust per-store caches so the next dashboard/notification load reflects the submission
    sInvalidate(`store:dashboard:${storeId}`, `store:notifications:${storeId}`, 'admin:dashboard', 'admin:notifications');

    createAuditLog({
      userId: req.user.id,
      action: 'SUBMIT_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: parsedBatchId,
      metadata: { recordCount: count },
    }).catch(err => console.error('[audit] SUBMIT_INVENTORY log failed:', err.message));
    detectRepeatDiscrepancies(storeId, parsedBatchId, req.user.id).catch(err => console.error('[detect-repeat] Failed:', err.message));

    // Fetch a fresh store row to get the current areaManagerId.
    // req.user.store is populated from the auth cache (30s TTL) and may be stale
    // if the admin reassigned the store to a different AM between login and submission.
    const freshStore = await prisma.store.findUnique({
      where: { id: storeId },
      select: { areaManagerId: true },
    }).catch(() => null);
    const amId = freshStore?.areaManagerId ?? null;

    if (amId) {
      try {
        await prisma.areaManagerReview.upsert({
          where:  { batchId_storeId: { batchId: parsedBatchId, storeId } },
          create: { batchId: parsedBatchId, storeId, areaManagerId: amId, status: 'PENDING_REVIEW', createdAt: new Date(), updatedAt: new Date() },
          update: { status: 'PENDING_REVIEW', areaManagerId: amId, remarks: null, reviewedAt: null, updatedAt: new Date() },
        });
        // Bust AM caches so the AM's pending-review count updates immediately
        sInvalidate(`am:batches:${amId}`, `am:notifications:${amId}`);
      } catch (amErr) {
        // Non-fatal: log clearly so it can be investigated without failing the submission
        console.error('[submit] AM review upsert failed — store submitted but AM review not created:', amErr.message);
      }
    }

    // Fire-and-forget email notifications after successful submission
    const shortageCount = records.filter(r => (r.difference ?? 0) < 0).length;
    const matchedCount  = records.filter(r => (r.difference ?? 0) === 0).length;
    const excessCount   = records.filter(r => (r.difference ?? 0) > 0).length;

    Promise.all([
      prisma.uploadBatch.findUnique({ where: { id: parsedBatchId }, select: { inventoryDate: true } }),
      prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, pendingApproval: false, NOT: { email: null } }, select: { email: true, name: true } }),
    ]).then(async ([b, admins]) => {
      if (!b) return;
      const batchDate = b.inventoryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const { sendSubmissionEmail, sendManagerSubmissionConfirmation } = await import('../services/emailService.js');

      // 1. Notify all admins — fall back to ADMIN_EMAIL env var if no admin has email in DB
      let adminList = admins;
      if (adminList.length === 0 && process.env.ADMIN_EMAIL) {
        adminList = [{ email: process.env.ADMIN_EMAIL, name: 'Administrator' }];
      }
      if (req.user.store && adminList.length > 0) {
        const adminResults = await Promise.allSettled(
          adminList.map(admin =>
            sendSubmissionEmail({ adminEmail: admin.email, adminName: admin.name, store: req.user.store, batchDate, recordCount: count, shortages: shortageCount })
          )
        );
        const adminFailed = adminResults.filter(r => r.status === 'rejected');
        if (adminFailed.length) console.error('[submit] Admin notification error:', adminFailed[0].reason?.message);
      }

      // 2. Confirm to the submitting store manager
      if (req.user.email && req.user.store) {
        sendManagerSubmissionConfirmation({
          managerEmail: req.user.email,
          managerName:  req.user.name,
          store:        req.user.store,
          batchDate,
          recordCount:  count,
          shortages:    shortageCount,
          matched:      matchedCount,
          excess:       excessCount,
        }).catch(e => console.error('[submit] Manager confirmation error:', e.message));
      }
    }).catch(e => console.error('[submit] Email query failed:', e.message));

    res.json({
      message: 'Inventory submitted successfully',
      recordCount: count,
      records,
    });
  } catch (error) {
    next(error);
  }
}

async function detectRepeatDiscrepancies(storeId, batchId, userId) {
  // Fetch currentBatch + currentShortages in parallel — exit early if no shortages
  const [currentBatch, currentShortages] = await Promise.all([
    prisma.uploadBatch.findUnique({ where: { id: batchId }, select: { inventoryDate: true } }),
    prisma.inventoryRecord.findMany({
      where: { storeId, batchId, status: 'SUBMITTED', difference: { lt: 0 } },
      select: { materialCode: true },
    }),
  ]);
  if (!currentBatch || currentShortages.length === 0) return;

  const priorBatches = await prisma.uploadBatch.findMany({
    where: { inventoryDate: { lt: currentBatch.inventoryDate }, isDeleted: false },
    orderBy: { inventoryDate: 'desc' },
    take: 3,
    select: { id: true },
  });
  if (priorBatches.length === 0) return;

  const priorBatchIds    = priorBatches.map((b) => b.id);
  const currentMaterials = currentShortages.map((r) => r.materialCode);

  const priorShortages = await prisma.inventoryRecord.findMany({
    where: {
      storeId,
      batchId: { in: priorBatchIds },
      status: 'SUBMITTED',
      difference: { lt: 0 },
      materialCode: { in: currentMaterials },
    },
    select: { materialCode: true, batchId: true },
    distinct: ['materialCode'],
  });

  const repeatMaterials = new Set(priorShortages.map((r) => r.materialCode));
  if (repeatMaterials.size === 0) return;

  // Persist the flag so getInventory reads it directly — no per-page cross-batch query needed
  await prisma.inventoryRecord.updateMany({
    where: {
      storeId,
      batchId,
      status:       'SUBMITTED',
      difference:   { lt: 0 },
      materialCode: { in: Array.from(repeatMaterials) },
    },
    data: { isRepeat: true },
  });

  await createAuditLog({
    userId,
    action: 'REPEAT_DISCREPANCY',
    entityType: 'UPLOAD_BATCH',
    entityId: batchId,
    metadata: {
      storeId,
      batchId,
      materials: Array.from(repeatMaterials),
      count: repeatMaterials.size,
    },
  });
}

export async function getNotifications(req, res, next) {
  try {
    const storeId = req.user.storeId;
    const cacheKey = `store:notifications:${storeId}`;
    const cached = sGet(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const items = [];

    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Only show RETURNED reviews where the store still has PENDING records in that batch.
    // If the store has already resubmitted after a return, the records are back to SUBMITTED
    // and the review has been updated to PENDING_REVIEW — the notification is no longer relevant.
    const returnedReviews = await prisma.areaManagerReview.findMany({
      where: {
        storeId,
        status: 'RETURNED',
        // Scope the "still pending" test to THIS review's batch by walking the batch
        // relation. Testing it via `store` instead would match a pending record in any
        // batch, so an unrelated new cycle would keep a stale return alert alive.
        batch: {
          isDeleted: false,
          inventoryRecords: { some: { storeId, status: 'PENDING' } },
        },
      },
      select: { batchId: true, remarks: true, batch: { select: { inventoryDate: true } } },
      take: 5,
      orderBy: { reviewedAt: 'desc' },
    }).catch(() => []);
    for (const r of returnedReviews) {
      if (!r.batch) continue;
      const dateLabel = new Date(r.batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      items.push({ type: 'returned', message: `${dateLabel} — Returned by Area Manager. Please recount and resubmit.`, batchId: r.batchId, urgent: true });
    }

    // Every live batch that still has PENDING records for this store.
    // isDeleted must be filtered here exactly as it is on the dashboard — a soft-deleted
    // cycle keeps its PENDING records, so without this the bell shows (eventually urgent,
    // "past deadline") alerts for a cycle the dashboard no longer lists and the manager
    // cannot open.
    const pendingBatches = await prisma.uploadBatch.findMany({
      where: { isDeleted: false, inventoryRecords: { some: { storeId, status: 'PENDING' } } },
      orderBy: { inventoryDate: 'desc' },
      select: {
        id: true,
        inventoryDate: true,
        submissionDeadline: true,
        uploadedAt: true,
        deadlineExtensions: {
          where: { storeId },
          select: { newDeadline: true },
        },
      },
    });

    for (const batch of pendingBatches) {
      const ext = batch.deadlineExtensions[0];
      const deadline = ext ? ext.newDeadline : batch.submissionDeadline;
      const dateLabel = new Date(batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const isNew = batch.uploadedAt && new Date(batch.uploadedAt) >= since24h;

      if (deadline && now > new Date(deadline)) {
        items.push({ type: 'overdue', message: `${dateLabel} — Past deadline, contact your admin`, batchId: batch.id, urgent: true });
      } else if (deadline) {
        const hoursLeft = Math.round((new Date(deadline) - now) / 3600000);
        if (hoursLeft <= 48) {
          items.push({ type: 'deadline', message: `${dateLabel} — Deadline in ${hoursLeft < 1 ? '<1' : hoursLeft}h`, batchId: batch.id, urgent: hoursLeft <= 12 });
        } else if (isNew) {
          items.push({ type: 'new', message: `New cycle for ${dateLabel} — start your count!`, batchId: batch.id, urgent: false });
        } else {
          items.push({ type: 'pending', message: `${dateLabel} — Items waiting for your count`, batchId: batch.id, urgent: false });
        }
      } else if (isNew) {
        items.push({ type: 'new', message: `New cycle for ${dateLabel} — start your count!`, batchId: batch.id, urgent: false });
      } else {
        items.push({ type: 'pending', message: `${dateLabel} — Items waiting for your count`, batchId: batch.id, urgent: false });
      }
    }

    const result = { items, count: items.length };
    sSet(cacheKey, result, 30_000);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function downloadInventory(req, res, next) {
  try {
    const storeId = req.user.storeId;
    const { batchId: queryBatchId } = req.query;

    let targetBatchId;
    if (queryBatchId) {
      targetBatchId = requireId(queryBatchId, 'batchId');
    } else {
      // Fall back to latest live batch for this store — a soft-deleted cycle keeps its
      // records, so without the isDeleted filter this can silently export a deleted cycle.
      const latestBatch = await prisma.uploadBatch.findFirst({
        where: { isDeleted: false, inventoryRecords: { some: { storeId } } },
        orderBy: { inventoryDate: 'desc' },
      });
      if (!latestBatch) throw new AppError('No inventory records found for your store in this cycle', 404);
      targetBatchId = latestBatch.id;
    }

    const STORE_EXPORT_LIMIT = 10_000;
    const exportCount = await prisma.inventoryRecord.count({ where: { storeId, batchId: targetBatchId } });
    if (exportCount > STORE_EXPORT_LIMIT) {
      throw new AppError(`This cycle has ${exportCount.toLocaleString()} records which is too large to export directly. Please contact your administrator`, 413);
    }

    // Get records for this store in the selected batch
    const records = await prisma.inventoryRecord.findMany({
      where: {
        storeId,
        batchId: targetBatchId,
      },
      include: {
        batch: {
          select: {
            inventoryDate: true,
          },
        },
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
      },
      orderBy: { materialCode: 'asc' },
    });

    if (records.length === 0) {
      throw new AppError('No inventory records found for your store in this cycle', 404);
    }

    const workbook = buildInventoryWorkbook(records, {
      sheetName:        'Inventory',
      includeDate:      true,
      includeSubmitter: false,
    });

    createAuditLog({
      userId: req.user.id,
      action: 'DOWNLOAD_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: targetBatchId,
      metadata: { recordCount: records.length, batchId: targetBatchId },
    }).catch(err => console.error('[audit] DOWNLOAD_INVENTORY log failed:', err.message));

    // Send file
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=store_${req.user.store.storeCode}_inventory.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}
