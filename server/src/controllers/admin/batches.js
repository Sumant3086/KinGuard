// Cycle management: deadlines, extensions, unlocks, closing, and reminders.

import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../services/auditService.js';
import { logger, errorDetails } from '../../config/logger.js';
import prisma from '../../config/prisma.js';
import { sGet, sSet, sInvalidate } from '../../services/serverCache.js';
import { requireId } from '../../utils/params.js';
import { buildInventoryWorkbook } from '../../utils/excelExport.js';
import { invalidateBatchAudience, parseUserDate, withDbRetry } from './shared.js';

export async function getBatches(req, res, next) {
  try {
    const cached = sGet('admin:batches');
    if (cached) return res.json(cached);

    const batches = await withDbRetry(() => prisma.uploadBatch.findMany({
      where: { isDeleted: false },
      orderBy: { inventoryDate: 'desc' },
      // _count.inventoryRecords is deliberately NOT included here: Prisma emits it as a
      // correlated subquery per batch row, counting exactly the same rows the stats
      // query below already groups. It is re-attached from those stats so the response
      // shape is unchanged.
      include: {
        uploader: { select: { name: true, employeeId: true } },
        deadlineExtensions: { select: { storeId: true, newDeadline: true } },
      },
    }));

    const batchIds = batches.map(b => b.id);
    const statsRows = batchIds.length > 0 ? await prisma.$queryRaw`
      SELECT "batchId",
        COUNT(*)::int AS "totalRecords",
        COUNT(CASE WHEN status='SUBMITTED' THEN 1 END)::int AS "submittedCount",
        COUNT(CASE WHEN status='PENDING'   THEN 1 END)::int AS "pendingCount",
        COUNT(DISTINCT "storeId")::int AS "storeCount"
      FROM "InventoryRecord"
      WHERE "batchId" = ANY(${batchIds})
      GROUP BY "batchId"
    ` : [];

    const statsMap = new Map(statsRows.map(r => [Number(r.batchId), r]));
    // A batch with no records at all has no stats row, and its count is zero.
    const result = batches.map(b => {
      const stats = statsMap.get(b.id) || null;
      return { ...b, _count: { inventoryRecords: stats?.totalRecords ?? 0 }, stats };
    });
    sSet('admin:batches', result, 60_000); // 1-minute cache
    res.json(result);
  } catch (error) { next(error); }
}

export async function updateBatch(req, res, next) {
  try {
    const batchId = requireId(req.params.id, 'batchId');
    const { submissionDeadline } = req.body;
    const parsedDeadline = parseUserDate(submissionDeadline, 'submissionDeadline');

    const existing = await prisma.uploadBatch.findFirst({
      where: { id: batchId, isDeleted: false },
      select: { id: true, submissionDeadline: true },
    });
    if (!existing) throw new AppError('Cycle not found', 404);

    // Moving the deadline later re-opens the cycle, so the reminder/escalation state
    // has to be rewound too. Without this a batch that already sent its "1 hour left"
    // email (or escalated) stays stamped, and the extended window passes with the
    // stores getting no warning at all.
    const data = { submissionDeadline: parsedDeadline };
    if (!existing.submissionDeadline || parsedDeadline > existing.submissionDeadline) {
      data.autoReminderSentAt = null;
      data.escalationLevel    = 0;
    }

    const batch = await prisma.uploadBatch.update({ where: { id: batchId }, data });
    await createAuditLog({
      userId: req.user.id, action: 'UPDATE_BATCH_DEADLINE',
      entityType: 'UPLOAD_BATCH', entityId: batch.id,
      metadata: { submissionDeadline },
    });
    sInvalidate('admin:batches', 'admin:notifications');
    res.json(batch);
  } catch (error) { next(error); }
}

// Close a cycle: set the deadline to right now so all remaining pending stores
// are immediately locked. Any previously submitted records are unaffected.
export async function closeBatch(req, res, next) {
  try {
    const batchId = requireId(req.params.id, 'batchId');
    const batch = await prisma.uploadBatch.findFirst({
      where: { id: batchId, isDeleted: false },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });
    if (!batch) throw new AppError('Cycle not found', 404);

    const now = new Date();
    // If deadline is already in the past, cycle is already locked — no-op
    if (batch.submissionDeadline && batch.submissionDeadline <= now) {
      return res.json({ message: 'Cycle is already locked', alreadyClosed: true });
    }

    const [pendingCount, submittedCount] = await Promise.all([
      prisma.inventoryRecord.count({ where: { batchId, status: 'PENDING' } }),
      prisma.inventoryRecord.count({ where: { batchId, status: 'SUBMITTED' } }),
    ]);

    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: { submissionDeadline: now },
    });

    await createAuditLog({
      userId: req.user.id, action: 'CLOSE_BATCH',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { inventoryDate: batch.inventoryDate, lockedPendingItems: pendingCount, submittedItems: submittedCount },
    });

    sInvalidate('admin:dashboard', 'admin:batches', 'admin:notifications',
                'admin:trends:6', 'admin:trends:8', 'admin:trends:12');
    await invalidateBatchAudience(batchId);
    res.json({
      message:        `Cycle locked. ${pendingCount} pending item(s) frozen, ${submittedCount} already submitted.`,
      pendingCount,
      submittedCount,
      noSubmissions:  submittedCount === 0,
    });
  } catch (error) { next(error); }
}

export async function grantStoreExtension(req, res, next) {
  try {
    const { newDeadline, note } = req.body;
    const batchId = requireId(req.body.batchId, 'batchId');
    const storeId = requireId(req.body.storeId, 'storeId');
    if (!newDeadline) throw new AppError('newDeadline is required', 400);
    const deadlineDate = new Date(newDeadline);
    if (isNaN(deadlineDate.getTime())) throw new AppError('Invalid deadline date', 400);
    if (deadlineDate <= new Date()) throw new AppError('Extension deadline must be in the future', 400);
    const [batch, store] = await Promise.all([
      prisma.uploadBatch.findFirst({ where: { id: batchId, isDeleted: false }, select: { id: true, inventoryDate: true } }),
      prisma.store.findUnique({ where: { id: storeId }, select: { id: true, storeCode: true, storeName: true } }),
    ]);
    if (!batch) throw new AppError('Batch not found', 404);
    if (!store) throw new AppError('Store not found', 404);
    const ext = await prisma.batchDeadlineExtension.upsert({
      where: { batchId_storeId: { batchId, storeId } },
      update: { newDeadline: new Date(newDeadline), grantedBy: req.user.id, grantedAt: new Date(), note: note || null },
      create: { batchId, storeId, newDeadline: new Date(newDeadline), grantedBy: req.user.id, note: note || null },
    });
    await createAuditLog({
      userId: req.user.id, action: 'GRANT_STORE_EXTENSION',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { storeCode: store.storeCode, storeName: store.storeName, newDeadline, note },
    });
    sInvalidate('admin:batches', `store:dashboard:${storeId}`, `store:notifications:${storeId}`);
    res.json(ext);
  } catch (error) { next(error); }
}

export async function getBatchExport(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');
    const batch = await prisma.uploadBatch.findFirst({
      where: { id: batchId, isDeleted: false },
      select: { inventoryDate: true, originalFileName: true },
    });
    if (!batch) throw new AppError('Batch not found', 404);

    const records = await prisma.inventoryRecord.findMany({
      where: { batchId },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: { select: { storeCode: true, storeName: true } },
        submitter: { select: { name: true, employeeId: true } },
      },
    });

    const workbook = buildInventoryWorkbook(records, {
      sheetName:       'Batch Export',
      includeDate:     false,
      includeSubmitter: true,
    });

    await createAuditLog({ userId: req.user.id, action: 'DOWNLOAD_BATCH_EXPORT', entityType: 'UPLOAD_BATCH', entityId: batchId, metadata: { recordCount: records.length } });

    const dateStr = batch.inventoryDate.toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_Batch_${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
}

// ── Excel sample template ────────────────────────────────────────────────────

export async function deleteBatch(req, res, next) {
  try {
    const batchId = requireId(req.params.id, 'batchId');

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId, isDeleted: false },
      select: { id: true, inventoryDate: true, originalFileName: true },
    });
    if (!batch) throw new AppError('Cycle not found', 404);

    // Soft delete: mark the batch as deleted rather than removing data permanently.
    // This allows recovery of financial reconciliation data if a batch is deleted by mistake.
    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.id },
    });

    await createAuditLog({
      userId: req.user.id, action: 'DELETE_BATCH',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { inventoryDate: batch.inventoryDate, fileName: batch.originalFileName, softDelete: true },
    });

    sInvalidate('admin:dashboard', 'admin:batches', 'admin:notifications', 'admin:trends:6', 'admin:trends:8', 'admin:trends:12');
    await invalidateBatchAudience(batchId);
    res.json({ message: 'Cycle deleted' });
  } catch (error) { next(error); }
}

// """ Unlock a store's submission so they can re-count """""""""""""""""""""""""

export async function unlockStoreForBatch(req, res, next) {
  try {
    const batchId = requireId(req.params.id, 'batchId');
    const storeId = requireId(req.body.storeId, 'storeId');

    const [result] = await prisma.$transaction([
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
      // Clear any stale AM review so the store goes through review again after resubmission
      prisma.areaManagerReview.deleteMany({ where: { batchId, storeId } }),
    ]);

    await createAuditLog({
      userId: req.user.id, action: 'UNLOCK_STORE_SUBMISSION',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { storeId, recordsUnlocked: result.count },
    });

    // Bust the unlocked store's caches + admin batch list
    sInvalidate('admin:dashboard', 'admin:batches',
                `store:dashboard:${storeId}`, `store:notifications:${storeId}`);

    // Bust the AM's caches if this store is assigned to one (non-fatal if query fails)
    prisma.store.findUnique({ where: { id: storeId }, select: { areaManagerId: true } })
      .then(s => { if (s?.areaManagerId) sInvalidate(`am:batches:${s.areaManagerId}`, `am:notifications:${s.areaManagerId}`); })
      .catch(() => {});

    res.json({ message: `${result.count} record(s) reset to pending`, count: result.count });
  } catch (error) { next(error); }
}

// """ Admin override of any inventory record """""""""""""""""""""""""""""""""""

export async function sendBatchReminders(req, res, next) {
  try {
    const batchId = requireId(req.params.id, 'batchId');
    const batch = await prisma.uploadBatch.findFirst({
      where: { id: batchId, isDeleted: false },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });
    if (!batch) throw new AppError('Batch not found', 404);

    const [pendingRecords, extensions] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where: { batchId, status: 'PENDING' },
        select: { storeId: true },
        distinct: ['storeId'],
      }),
      prisma.batchDeadlineExtension.findMany({
        where: { batchId },
        select: { storeId: true, newDeadline: true },
      }),
    ]);

    if (pendingRecords.length === 0) {
      return res.json({ sent: 0, pending: 0, message: 'All stores have submitted -- no reminders needed.' });
    }

    const storeIds = pendingRecords.map(r => r.storeId);
    const managers = await prisma.user.findMany({
      where: {
        role: 'STORE_MANAGER',
        isActive: true,
        storeId: { in: storeIds },
        email: { not: null },
      },
      include: { store: true },
    });

    if (!batch.submissionDeadline) {
      return res.json({
        sent: 0, pending: storeIds.length,
        message: 'No deadline set for this batch. Set a submission deadline before sending reminders.',
      });
    }

    // A store holding an extension is working to its own deadline, so quoting the
    // batch deadline at it would be wrong. Group the managers by the deadline that
    // actually applies to them and send one batch of emails per distinct deadline.
    const extensionByStore = new Map(extensions.map(e => [e.storeId, e.newDeadline]));
    const groups = new Map(); // deadline ISO → managers
    for (const m of managers) {
      const deadline = extensionByStore.get(m.storeId) ?? batch.submissionDeadline;
      const key = new Date(deadline).toISOString();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }

    let emailResult = { configured: false, sent: 0, failed: 0 };
    try {
      const { sendDeadlineReminderEmail } = await import('../services/emailService.js');
      // With no reachable managers still make one empty call, so the response can
      // tell "email is not configured" apart from "nobody has an email address".
      const entries = groups.size > 0
        ? [...groups.entries()]
        : [[new Date(batch.submissionDeadline).toISOString(), []]];
      const results = await Promise.all(entries.map(([deadline, group]) =>
        sendDeadlineReminderEmail({ managers: group, inventoryDate: batch.inventoryDate, deadline })
      ));
      emailResult = results.reduce((acc, r) => ({
        configured: acc.configured || r.configured,
        sent:       acc.sent   + r.sent,
        failed:     acc.failed + r.failed,
      }), { configured: false, sent: 0, failed: 0 });
    } catch (emailErr) {
      logger.error('Batch reminder email service error', errorDetails(emailErr));
      emailResult = { configured: true, sent: 0, failed: managers.length };
    }

    createAuditLog({
      userId: req.user.id, action: 'SEND_BATCH_REMINDERS',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { managerCount: managers.length, pendingStores: storeIds.length, emailsSent: emailResult.sent, smtpConfigured: emailResult.configured },
    }).catch(err => logger.error('Audit log failed', { action: 'SEND_BATCH_REMINDERS', ...errorDetails(err) }));

    const managersWithEmail = managers.length;
    let message;
    if (!emailResult.configured) {
      message = 'Email is not set up on this server. No reminders were sent.';
    } else if (managersWithEmail === 0) {
      message = 'No email addresses found for the pending store managers. Add emails in Users.';
    } else if (emailResult.sent === 0 && emailResult.failed > 0) {
      message = 'Could not send emails. Please try again later.';
    } else {
      const failedPart = emailResult.failed > 0 ? `, ${emailResult.failed} could not be delivered` : '';
      message = `Reminder sent to ${emailResult.sent} manager(s)${failedPart}.`;
    }

    res.json({
      sent: emailResult.sent,
      failed: emailResult.failed,
      smtpConfigured: emailResult.configured,
      pending: storeIds.length,
      message,
    });
  } catch (error) { next(error); }
}
