import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';
import { parseId, requireId } from '../utils/params.js';

export async function getDashboard(req, res, next) {
  const startTime = Date.now();
  try {
    const storeId = req.user.storeId;

    if (!req.user.store) {
      throw new AppError('Your store has been removed. Please contact your administrator.', 403);
    }

    // Get latest batch WHERE this store has inventory records
    const [latestBatch, allPendingBatches] = await Promise.all([
      prisma.uploadBatch.findFirst({
        where: { inventoryRecords: { some: { storeId } } },
        orderBy: { inventoryDate: 'desc' },
        select: {
          id: true,
          inventoryDate: true,
          uploadedAt: true,
          submissionDeadline: true,
        },
      }),
      // All batches that still have PENDING records — surfaces past-date uploads
      prisma.uploadBatch.findMany({
        where: { inventoryRecords: { some: { storeId, status: 'PENDING' } } },
        orderBy: { inventoryDate: 'desc' },
        select: { id: true, inventoryDate: true },
      }),
    ]);

    if (!latestBatch) {
      return res.json({
        store: req.user.store,
        batch: null,
        stats: { totalItems: 0, pendingItems: 0, submittedItems: 0, matchedItems: 0, shortageItems: 0, excessItems: 0 },
        olderPendingBatches: [],
      });
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

    res.json({
      store: req.user.store,
      batch: latestBatch,
      stats: stats[0],
      olderPendingBatches,
    });
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
    const storeId = req.user.storeId;
    const { search, status } = req.query;
    const batchId = parseId(req.query.batchId, 'batchId');

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
      where.status = status;
    }

    const [records, batchInfo] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where,
        orderBy: { materialCode: 'asc' },
      }),
      batchId
        ? prisma.uploadBatch.findUnique({
            where: { id: batchId },
            select: { submissionDeadline: true },
          })
        : Promise.resolve(null),
    ]);

    // C2: Check for per-store deadline extension override
    const extension = batchInfo?.submissionDeadline && batchId
      ? await prisma.batchDeadlineExtension.findUnique({
          where: { batchId_storeId: { batchId, storeId } },
          select: { newDeadline: true },
        })
      : null;
    const effectiveDeadline = extension ? extension.newDeadline : batchInfo?.submissionDeadline;
    const isLocked = effectiveDeadline ? new Date() > new Date(effectiveDeadline) : false;

    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] GET_INVENTORY (${records.length} records): ${duration}ms`);

    res.json({ records, isLocked });
  } catch (error) {
    next(error);
  }
}

export async function updateInventoryRecord(req, res, next) {
  const startTime = Date.now();
  try {
    const recordId = requireId(req.params.id, 'recordId');
    const storeId = req.user.storeId;
    const { physicalQuantity: rawPhys, systemQuantity: rawSys, remarks, shrinkageCategory } = req.body;

    const physicalProvided = rawPhys !== undefined;
    const systemProvided   = rawSys  !== undefined;

    const physicalQuantity = physicalProvided ? ((rawPhys === '' || rawPhys === null) ? null : rawPhys) : undefined;
    const systemQuantityIn = systemProvided   ? ((rawSys  === '' || rawSys  === null) ? null : rawSys)  : undefined;

    if (physicalProvided && physicalQuantity !== null) {
      const qty = parseFloat(physicalQuantity);
      if (isNaN(qty) || qty < 0) throw new AppError('Physical stock must be a non-negative number', 400);
    }
    if (systemProvided && systemQuantityIn !== null) {
      const qty = parseFloat(systemQuantityIn);
      if (isNaN(qty) || qty < 0) throw new AppError('System stock must be a non-negative number', 400);
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

    if (!record) throw new AppError('Record not found', 404);
    if (record.status === 'SUBMITTED') throw new AppError('Cannot edit submitted records', 403);

    if (record.batch?.submissionDeadline) {
      const extension = record.batch.deadlineExtensions?.[0] ?? null;
      const effectiveDeadline = extension ? extension.newDeadline : record.batch.submissionDeadline;
      if (new Date() > new Date(effectiveDeadline)) {
        throw new AppError('This batch is locked. The submission deadline has passed. Contact your administrator.', 403);
      }
    }

    // Resolve final values for both fields — used for diff AND for the DB write
    // so the stored physicalQuantity and the stored difference are always consistent.
    const finalSysQty  = systemProvided  && systemQuantityIn !== null
      ? parseFloat(systemQuantityIn)
      : record.systemQuantity;
    // When physicalQuantity is explicitly cleared (null), effectivePhysQty is null.
    // Falling back to record.physicalQuantity only when the field was NOT sent at all.
    const effectivePhysQty = physicalProvided
      ? (physicalQuantity !== null ? parseFloat(physicalQuantity) : null)
      : record.physicalQuantity;

    let difference = undefined;
    if (physicalProvided || systemProvided) {
      difference = effectivePhysQty !== null && effectivePhysQty !== undefined
        ? parseFloat((effectivePhysQty - finalSysQty).toFixed(4))
        : null;
    }

    const result = await prisma.inventoryRecord.update({
      where: { id: recordId },
      data: {
        systemQuantity:   systemProvided  ? finalSysQty     : undefined,
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
      metadata: { systemQuantity: finalSysQty, physicalQuantity: effectivePhysQty, remarks },
    }).catch(() => {});

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
    if (!batchForDeadline) throw new AppError('Batch not found', 404);
    if (batchForDeadline.submissionDeadline) {
      const extension = batchForDeadline.deadlineExtensions?.[0] ?? null;
      const effectiveDeadline = extension ? extension.newDeadline : batchForDeadline.submissionDeadline;
      if (new Date() > new Date(effectiveDeadline)) {
        throw new AppError('This batch is locked. The submission deadline has passed. Contact your administrator.', 403);
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

        if (pending.length === 0) throw new AppError('No pending records found', 400);

        const missingPhysical = pending.filter(r => r.physicalQuantity === null);
        if (missingPhysical.length > 0) {
          throw new AppError(
            `${missingPhysical.length} item(s) are missing Physical Stock. Please fill in all quantities before submitting.`,
            400
          );
        }

        const discrepant = pending.filter(r => r.difference !== null && r.difference !== 0);
        const missingCategory = discrepant.filter(r => !r.shrinkageCategory);
        if (missingCategory.length > 0) {
          throw new AppError(
            `${missingCategory.length} item(s) with discrepancies are missing a Category. Please select a category for each.`,
            400
          );
        }
        const missingDetail = discrepant.filter(r => !r.remarks || r.remarks.trim() === '');
        if (missingDetail.length > 0) {
          throw new AppError(
            `${missingDetail.length} item(s) with discrepancies are missing Issue Details. Please provide details for each discrepancy.`,
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
        throw new AppError('This inventory has already been submitted. Please refresh the page.', 409);
      }
      throw txErr;
    }

    const { count, records } = txResult;

    createAuditLog({
      userId: req.user.id,
      action: 'SUBMIT_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: parsedBatchId,
      metadata: { recordCount: count },
    }).catch(() => {});
    detectRepeatDiscrepancies(storeId, parsedBatchId, req.user.id).catch(() => {});

    // Fire-and-forget email notifications after successful submission
    const shortageCount = records.filter(r => (r.difference ?? 0) < 0).length;
    const matchedCount  = records.filter(r => (r.difference ?? 0) === 0).length;
    const excessCount   = records.filter(r => (r.difference ?? 0) > 0).length;

    Promise.all([
      prisma.uploadBatch.findUnique({ where: { id: parsedBatchId }, select: { inventoryDate: true } }),
      prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, NOT: { email: null } }, select: { email: true, name: true } }),
    ]).then(async ([b, admins]) => {
      if (!b) return;
      const batchDate = b.inventoryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const { sendSubmissionEmail, sendManagerSubmissionConfirmation } = await import('../services/emailService.js');

      // 1. Notify all admins — fall back to ADMIN_EMAIL env var if no admin has email in DB
      let adminList = admins;
      if (adminList.length === 0 && process.env.ADMIN_EMAIL) {
        adminList = [{ email: process.env.ADMIN_EMAIL, name: 'Administrator' }];
        console.log('[submit] No DB admins with email — falling back to ADMIN_EMAIL env var');
      }
      console.log(`[submit] Notifying ${adminList.length} admin(s) of submission from ${req.user.store?.storeName}`);
      const adminResults = await Promise.allSettled(
        adminList.filter(() => req.user.store).map(admin =>
          sendSubmissionEmail({ adminEmail: admin.email, adminName: admin.name, store: req.user.store, batchDate, recordCount: count, shortages: shortageCount })
        )
      );
      const adminFailed = adminResults.filter(r => r.status === 'rejected');
      if (adminFailed.length) console.error('[submit] Admin notification error:', adminFailed[0].reason?.message);
      else console.log(`[submit] Admin notification sent to ${adminList.length} admin(s)`);

      // 2. Confirm to the submitting store manager
      if (req.user.email && req.user.store) {
        console.log(`[submit] Sending confirmation to manager: ${req.user.email}`);
        sendManagerSubmissionConfirmation({
          managerEmail: req.user.email,
          managerName:  req.user.name,
          store:        req.user.store,
          batchDate,
          recordCount:  count,
          shortages:    shortageCount,
          matched:      matchedCount,
          excess:       excessCount,
        }).then(() => console.log('[submit] Manager confirmation sent'))
          .catch(e => console.error('[submit] Manager confirmation error:', e.message));
      } else {
        console.log('[submit] Manager has no email — skipping confirmation');
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
  const currentBatch = await prisma.uploadBatch.findUnique({
    where: { id: batchId },
    select: { inventoryDate: true },
  });
  if (!currentBatch) return;

  const priorBatches = await prisma.uploadBatch.findMany({
    where: { inventoryDate: { lt: currentBatch.inventoryDate } },
    orderBy: { inventoryDate: 'desc' },
    take: 2,
    select: { id: true },
  });
  if (priorBatches.length === 0) return;

  const priorBatchIds = priorBatches.map((b) => b.id);

  const currentShortages = await prisma.inventoryRecord.findMany({
    where: { storeId, batchId, status: 'SUBMITTED', difference: { lt: 0 } },
    select: { materialCode: true },
  });
  if (currentShortages.length === 0) return;

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
  });

  const repeatMaterials = new Set(priorShortages.map((r) => r.materialCode));
  if (repeatMaterials.size === 0) return;

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
    const now = new Date();
    const items = [];

    // Every batch that still has PENDING records for this store
    const pendingBatches = await prisma.uploadBatch.findMany({
      where: { inventoryRecords: { some: { storeId, status: 'PENDING' } } },
      orderBy: { inventoryDate: 'desc' },
      select: {
        id: true,
        inventoryDate: true,
        submissionDeadline: true,
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

      if (deadline && now > new Date(deadline)) {
        items.push({ type: 'overdue', message: `${dateLabel} — Past deadline, contact your admin`, batchId: batch.id, urgent: true });
      } else if (deadline) {
        const hoursLeft = Math.round((new Date(deadline) - now) / 3600000);
        if (hoursLeft <= 48) {
          items.push({ type: 'deadline', message: `${dateLabel} — Deadline in ${hoursLeft < 1 ? '<1' : hoursLeft}h`, batchId: batch.id, urgent: hoursLeft <= 12 });
        } else {
          items.push({ type: 'pending', message: `${dateLabel} — Items waiting for your count`, batchId: batch.id, urgent: false });
        }
      } else {
        items.push({ type: 'pending', message: `${dateLabel} — Items waiting for your count`, batchId: batch.id, urgent: false });
      }
    }

    res.json({ items, count: items.length });
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
      // Fall back to latest batch for this store
      const latestBatch = await prisma.uploadBatch.findFirst({
        where: { inventoryRecords: { some: { storeId } } },
        orderBy: { inventoryDate: 'desc' },
      });
      if (!latestBatch) throw new AppError('No inventory records found for your store', 404);
      targetBatchId = latestBatch.id;
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
          },
        },
      },
      orderBy: { materialCode: 'asc' },
    });

    if (records.length === 0) {
      throw new AppError('No inventory records found for your store', 404);
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory');

    // Add headers
    worksheet.columns = [
      { header: 'Plant Code', key: 'storeCode', width: 12 },
      { header: 'Date', key: 'inventoryDate', width: 15 },
      { header: 'Material Name', key: 'materialCode', width: 20 },
      { header: 'Material Description', key: 'materialName', width: 30 },
      { header: 'System Stock', key: 'systemQuantity', width: 14 },
      { header: 'Physical Stock', key: 'physicalQuantity', width: 14 },
      { header: 'Diff', key: 'difference', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    records.forEach((record) => {
      worksheet.addRow({
        storeCode: record.store.storeCode,
        inventoryDate: record.batch.inventoryDate.toISOString().split('T')[0],
        materialCode: record.materialCode,
        materialName: record.materialName,
        systemQuantity: record.systemQuantity,
        physicalQuantity: record.physicalQuantity,
        difference: record.difference,
        remarks: record.remarks,
        status: record.status,
      });
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
