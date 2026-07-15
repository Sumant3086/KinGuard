import prisma from '../config/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';

// ── Helper: get all storeIds managed by this AM ───────────────────────────────
async function getManagedStoreIds(areaManagerId) {
  const stores = await prisma.store.findMany({
    where: { areaManagerId, isActive: true },
    select: { id: true },
  });
  return stores.map(s => s.id);
}

// ── Dashboard overview ────────────────────────────────────────────────────────
export async function getDashboard(req, res, next) {
  try {
    const storeIds = await getManagedStoreIds(req.user.id);

    const latestBatch = await prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });

    if (!storeIds.length || !latestBatch) {
      return res.json({ storeCount: storeIds.length, pendingReview: 0, approved: 0, returned: 0, latestBatch: null });
    }

    const [reviews, totalSubmitted] = await Promise.all([
      prisma.areaManagerReview.findMany({
        where: { batchId: latestBatch.id, areaManagerId: req.user.id },
        select: { status: true },
      }),
      prisma.inventoryRecord.findMany({
        where: { batchId: latestBatch.id, storeId: { in: storeIds }, status: 'SUBMITTED' },
        select: { storeId: true },
        distinct: ['storeId'],
      }),
    ]);

    res.json({
      storeCount:    storeIds.length,
      pendingReview: reviews.filter(r => r.status === 'PENDING_REVIEW').length,
      approved:      reviews.filter(r => r.status === 'APPROVED').length,
      returned:      reviews.filter(r => r.status === 'RETURNED').length,
      latestBatch,
    });
  } catch (error) { next(error); }
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function getNotifications(req, res, next) {
  try {
    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.length) return res.json({ items: [], count: 0 });

    const now = new Date();
    const items = [];

    const latestBatch = await prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });

    if (!latestBatch) return res.json({ items: [], count: 0 });

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

    res.json({ items, count: items.length });
  } catch (error) { next(error); }
}

// ── All batches for AM's stores ───────────────────────────────────────────────
export async function getBatches(req, res, next) {
  try {
    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.length) return res.json([]);

    const batches = await prisma.uploadBatch.findMany({
      where: {
        status: 'COMPLETED',
        inventoryRecords: { some: { storeId: { in: storeIds } } },
      },
      orderBy: { inventoryDate: 'desc' },
      select: {
        id: true, inventoryDate: true, submissionDeadline: true, uploadedAt: true,
        amReviews: {
          where: { storeId: { in: storeIds } },
          select: { storeId: true, status: true },
        },
        inventoryRecords: {
          where: { storeId: { in: storeIds } },
          select: { storeId: true, status: true },
          distinct: ['storeId', 'status'],
        },
      },
    });

    const result = batches.map(b => {
      const storeStatuses = storeIds.map(sid => {
        const review = b.amReviews.find(r => r.storeId === sid);
        const records = b.inventoryRecords.filter(r => r.storeId === sid);
        const allSubmitted = records.length > 0 && records.every(r => r.status === 'SUBMITTED');
        const allPending   = records.every(r => r.status === 'PENDING');
        return {
          storeId: sid,
          reviewStatus: review?.status || null,
          submitted: allSubmitted,
          pending: allPending,
        };
      });

      return {
        id: b.id,
        inventoryDate: b.inventoryDate,
        submissionDeadline: b.submissionDeadline,
        uploadedAt: b.uploadedAt,
        pendingReview:  storeStatuses.filter(s => s.reviewStatus === 'PENDING_REVIEW').length,
        approved:       storeStatuses.filter(s => s.reviewStatus === 'APPROVED').length,
        returned:       storeStatuses.filter(s => s.reviewStatus === 'RETURNED').length,
        notSubmitted:   storeStatuses.filter(s => s.submitted === false && s.reviewStatus === null).length,
        totalStores:    storeIds.length,
      };
    });

    res.json(result);
  } catch (error) { next(error); }
}

// ── Stores summary for one batch ──────────────────────────────────────────────
export async function getBatchStores(req, res, next) {
  try {
    const batchId  = parseInt(req.params.batchId);
    if (isNaN(batchId)) throw new AppError('Invalid batch ID', 400);

    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.length) return res.json([]);

    const [stores, reviewMap] = await Promise.all([
      prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, storeCode: true, storeName: true },
      }),
      prisma.areaManagerReview.findMany({
        where: { batchId, storeId: { in: storeIds } },
        select: { storeId: true, status: true, remarks: true, reviewedAt: true },
      }),
    ]);

    const recordCounts = await prisma.inventoryRecord.groupBy({
      by: ['storeId', 'status'],
      where: { batchId, storeId: { in: storeIds } },
      _count: true,
    });

    const result = stores.map(store => {
      const review   = reviewMap.find(r => r.storeId === store.id);
      const pending  = recordCounts.find(r => r.storeId === store.id && r.status === 'PENDING')?._count  || 0;
      const submitted= recordCounts.find(r => r.storeId === store.id && r.status === 'SUBMITTED')?._count || 0;
      const total    = pending + submitted;
      return {
        ...store,
        total, pending, submitted,
        allSubmitted: total > 0 && submitted === total,
        reviewStatus: review?.status || null,
        reviewRemarks: review?.remarks || null,
        reviewedAt: review?.reviewedAt || null,
      };
    });

    res.json(result);
  } catch (error) { next(error); }
}

// ── Records for a specific store+batch ────────────────────────────────────────
export async function getStoreRecords(req, res, next) {
  try {
    const batchId = parseInt(req.params.batchId);
    const storeId = parseInt(req.params.storeId);
    if (isNaN(batchId) || isNaN(storeId)) throw new AppError('Invalid parameters', 400);

    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.includes(storeId)) throw new AppError('Store not under your management', 403);

    const [records, review, store] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where: { batchId, storeId },
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
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('Invalid record ID', 400);

    const record = await prisma.inventoryRecord.findUnique({
      where: { id },
      select: { storeId: true, batchId: true, status: true },
    });
    if (!record) throw new AppError('Record not found', 404);
    if (record.status !== 'SUBMITTED') throw new AppError('Only submitted records can be edited', 400);

    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.includes(record.storeId)) throw new AppError('Store not under your management', 403);

    const { physicalQuantity, remarks, shrinkageCategory } = req.body;
    const updateData = {};
    if (physicalQuantity !== undefined) {
      const qty = parseFloat(physicalQuantity);
      if (isNaN(qty) || qty < 0) throw new AppError('Physical count must be 0 or more', 400);
      const updated = await prisma.inventoryRecord.findUnique({ where: { id }, select: { systemQuantity: true } });
      updateData.physicalQuantity = qty;
      updateData.difference = qty - updated.systemQuantity;
    }
    if (remarks !== undefined)          updateData.remarks = remarks || null;
    if (shrinkageCategory !== undefined) updateData.shrinkageCategory = shrinkageCategory || null;

    const updated = await prisma.inventoryRecord.update({ where: { id }, data: updateData });
    res.json(updated);
  } catch (error) { next(error); }
}

// ── Approve a store's submission ──────────────────────────────────────────────
export async function approveStore(req, res, next) {
  try {
    const batchId = parseInt(req.params.batchId);
    const storeId = parseInt(req.params.storeId);
    if (isNaN(batchId) || isNaN(storeId)) throw new AppError('Invalid parameters', 400);

    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.includes(storeId)) throw new AppError('Store not under your management', 403);

    const { remarks } = req.body;

    const review = await prisma.areaManagerReview.upsert({
      where: { batchId_storeId: { batchId, storeId } },
      create: { batchId, storeId, areaManagerId: req.user.id, status: 'APPROVED', remarks: remarks || null, reviewedAt: new Date() },
      update: { status: 'APPROVED', remarks: remarks || null, reviewedAt: new Date() },
    });

    createAuditLog({ userId: req.user.id, action: 'AM_APPROVE', entityType: 'STORE', entityId: storeId, metadata: { batchId, remarks } }).catch(() => {});

    // Notify all admins
    Promise.all([
      prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, NOT: { email: null } }, select: { email: true, name: true } }),
      prisma.store.findUnique({ where: { id: storeId }, select: { storeName: true, storeCode: true } }),
      prisma.uploadBatch.findUnique({ where: { id: batchId }, select: { inventoryDate: true } }),
    ]).then(async ([admins, store, batch]) => {
      if (!admins.length || !store || !batch) return;
      const { sendAMApprovalEmail } = await import('../services/emailService.js');
      for (const admin of admins) {
        sendAMApprovalEmail({ adminEmail: admin.email, adminName: admin.name, store, areaManagerName: req.user.name, batchDate: new Date(batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), remarks: remarks || null })
          .catch(e => console.error('[am-approve] Email error:', e.message));
      }
    }).catch(e => console.error('[am-approve] Notify error:', e.message));

    res.json({ ok: true, review });
  } catch (error) { next(error); }
}

// ── Return store submission for recount ───────────────────────────────────────
export async function returnStore(req, res, next) {
  try {
    const batchId = parseInt(req.params.batchId);
    const storeId = parseInt(req.params.storeId);
    if (isNaN(batchId) || isNaN(storeId)) throw new AppError('Invalid parameters', 400);

    const storeIds = await getManagedStoreIds(req.user.id);
    if (!storeIds.includes(storeId)) throw new AppError('Store not under your management', 403);

    const { remarks } = req.body;
    if (!remarks?.trim()) throw new AppError('A reason is required when returning to the store manager', 400);

    await prisma.$transaction([
      // Reset all submitted records back to pending
      prisma.inventoryRecord.updateMany({
        where: { batchId, storeId, status: 'SUBMITTED' },
        data: { status: 'PENDING', submittedBy: null, submittedAt: null },
      }),
      // Mark the review as returned
      prisma.areaManagerReview.upsert({
        where: { batchId_storeId: { batchId, storeId } },
        create: { batchId, storeId, areaManagerId: req.user.id, status: 'RETURNED', remarks: remarks.trim(), reviewedAt: new Date() },
        update: { status: 'RETURNED', remarks: remarks.trim(), reviewedAt: new Date() },
      }),
    ]);

    createAuditLog({ userId: req.user.id, action: 'AM_RETURN', entityType: 'STORE', entityId: storeId, metadata: { batchId, remarks } }).catch(() => {});

    res.json({ ok: true });
  } catch (error) { next(error); }
}

// ── Admin: assign a store to an area manager ──────────────────────────────────
export async function assignStoreAM(req, res, next) {
  try {
    const storeId       = parseInt(req.params.storeId);
    const { areaManagerId } = req.body;
    if (isNaN(storeId)) throw new AppError('Invalid store ID', 400);

    if (areaManagerId !== null && areaManagerId !== undefined) {
      const am = await prisma.user.findUnique({ where: { id: parseInt(areaManagerId) }, select: { role: true } });
      if (!am || am.role !== 'AREA_MANAGER') throw new AppError('User is not an Area Manager', 400);
    }

    const store = await prisma.store.update({
      where: { id: storeId },
      data: { areaManagerId: areaManagerId ? parseInt(areaManagerId) : null },
      select: { id: true, storeCode: true, storeName: true, areaManagerId: true },
    });

    createAuditLog({ userId: req.user.id, action: 'ASSIGN_AREA_MANAGER', entityType: 'STORE', entityId: storeId, metadata: { areaManagerId } }).catch(() => {});
    res.json(store);
  } catch (error) { next(error); }
}

// ── Admin: list all area managers ─────────────────────────────────────────────
export async function getAreaManagers(req, res, next) {
  try {
    const ams = await prisma.user.findMany({
      where: { role: 'AREA_MANAGER', isActive: true },
      select: {
        id: true, name: true, employeeId: true, email: true,
        managedStores: { select: { id: true, storeCode: true, storeName: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(ams);
  } catch (error) { next(error); }
}
