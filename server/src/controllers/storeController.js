import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';

export async function getDashboard(req, res, next) {
  const startTime = Date.now();
  try {
    const storeId = req.user.storeId;

    // Get latest batch WHERE this store has inventory records - optimized query
    const latestBatch = await prisma.uploadBatch.findFirst({
      where: {
        inventoryRecords: {
          some: { storeId },
        },
      },
      orderBy: { inventoryDate: 'desc' },
      select: {
        id: true,
        inventoryDate: true,
        uploadedAt: true,
      },
    });

    if (!latestBatch) {
      return res.json({
        store: req.user.store,
        batch: null,
        stats: {
          totalItems: 0,
          pendingItems: 0,
          submittedItems: 0,
          matchedItems: 0,
          shortageItems: 0,
          excessItems: 0,
        },
      });
    }

    // Use database aggregation instead of loading all records
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

    res.json({
      store: req.user.store,
      batch: latestBatch,
      stats: stats[0],
    });
    
    const duration = Date.now() - startTime;
    console.log(`[PERF] GET_STORE_DASHBOARD: ${duration}ms`);
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
    console.log(`[PERF] GET_BATCHES (${batches.length} batches): ${duration}ms`);

    res.json(batches);
  } catch (error) {
    next(error);
  }
}

export async function getInventory(req, res, next) {
  const startTime = Date.now();
  try {
    const storeId = req.user.storeId;
    const { search, status, batchId } = req.query;

    const where = { storeId };

    if (batchId) {
      where.batchId = parseInt(batchId);
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
            where: { id: parseInt(batchId) },
            select: { submissionDeadline: true },
          })
        : Promise.resolve(null),
    ]);

    // C2: Check for per-store deadline extension override
    const extension = batchInfo?.submissionDeadline && batchId
      ? await prisma.batchDeadlineExtension.findUnique({
          where: { batchId_storeId: { batchId: parseInt(batchId), storeId } },
          select: { newDeadline: true },
        })
      : null;
    const effectiveDeadline = extension ? extension.newDeadline : batchInfo?.submissionDeadline;
    const isLocked = effectiveDeadline ? new Date() > new Date(effectiveDeadline) : false;

    const duration = Date.now() - startTime;
    console.log(`[PERF] GET_INVENTORY (${records.length} records): ${duration}ms`);

    res.json({ records, isLocked });
  } catch (error) {
    next(error);
  }
}

export async function updateInventoryRecord(req, res, next) {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const recordId = parseInt(id);
    const storeId = req.user.storeId;
    const { physicalQuantity: rawQty, remarks, shrinkageCategory } = req.body;

    const physicalQuantityProvided = rawQty !== undefined;
    const physicalQuantity = (rawQty === '' || rawQty === null) ? null : rawQty;

    if (physicalQuantityProvided && physicalQuantity !== null) {
      const qty = parseFloat(physicalQuantity);
      if (isNaN(qty) || qty < 0) {
        throw new AppError('Sold quantity must be a non-negative number', 400);
      }
    }

    // Single query: verify ownership + get systemQuantity + check batch deadline
    const record = await prisma.inventoryRecord.findFirst({
      where: { id: recordId, storeId },
      select: {
        id: true,
        systemQuantity: true,
        status: true,
        batchId: true,
        batch: { select: { submissionDeadline: true } },
      },
    });

    if (!record) throw new AppError('Record not found', 404);
    if (record.status === 'SUBMITTED') throw new AppError('Cannot edit submitted records', 403);

    // C2: Check for per-store deadline extension override
    if (record.batch?.submissionDeadline) {
      const extension = await prisma.batchDeadlineExtension.findUnique({
        where: { batchId_storeId: { batchId: record.batchId, storeId } },
        select: { newDeadline: true },
      });
      const effectiveDeadline = extension ? extension.newDeadline : record.batch.submissionDeadline;
      if (new Date() > new Date(effectiveDeadline)) {
        throw new AppError('This batch is locked. The submission deadline has passed. Contact your administrator.', 403);
      }
    }

    let difference = undefined;
    if (physicalQuantityProvided) {
      difference = physicalQuantity !== null
        ? parseFloat(physicalQuantity) - record.systemQuantity
        : null;
    }

    // Single update query — returns the updated record directly (no extra findUnique needed)
    const result = await prisma.inventoryRecord.update({
      where: { id: recordId },
      data: {
        physicalQuantity: physicalQuantityProvided
          ? (physicalQuantity !== null ? parseFloat(physicalQuantity) : null)
          : undefined,
        difference,
        remarks: remarks !== undefined ? remarks : undefined,
        shrinkageCategory: shrinkageCategory !== undefined ? (shrinkageCategory || null) : undefined,
      },
    });

    // Fire-and-forget — don't block the HTTP response for an audit log write
    createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: recordId,
      metadata: { physicalQuantity, remarks },
    }).catch(() => {});

    const duration = Date.now() - startTime;
    console.log(`[PERF] UPDATE_INVENTORY record ${id}: ${duration}ms`);

    res.json(result);
  } catch (error) {
    next(error);
  }
}


export async function submitInventory(req, res, next) {
  try {
    const storeId = req.user.storeId;
    const { batchId } = req.body;

    if (!batchId) {
      throw new AppError('Batch ID is required', 400);
    }

    const parsedBatchId = parseInt(batchId);
    const submittedAt   = new Date();

    // Fetch + validate pending records, then submit — all in one transaction
    const { count, records } = await prisma.$transaction(async (tx) => {
      const pending = await tx.inventoryRecord.findMany({
        where: { storeId, batchId: parsedBatchId, status: 'PENDING' },
      });

      if (pending.length === 0) throw new AppError('No pending records found', 400);

      const missing = pending.filter(r => r.physicalQuantity === null);
      if (missing.length > 0) {
        throw new AppError(
          `Please enter Sold quantity for all items before submitting. ${missing.length} items are missing.`,
          400
        );
      }

      await tx.inventoryRecord.updateMany({
        where: { storeId, batchId: parsedBatchId, status: 'PENDING' },
        data: { status: 'SUBMITTED', submittedBy: req.user.id, submittedAt },
      });

      // Return the records with updated status so we don't need a second fetch
      return {
        count: pending.length,
        records: pending
          .map(r => ({ ...r, status: 'SUBMITTED', submittedBy: req.user.id, submittedAt }))
          .sort((a, b) => (a.difference ?? 0) - (b.difference ?? 0)),
      };
    });

    // Fire-and-forget side effects — don't block the response
    createAuditLog({
      userId: req.user.id,
      action: 'SUBMIT_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: parsedBatchId,
      metadata: { recordCount: count },
    }).catch(() => {});
    detectRepeatDiscrepancies(storeId, parsedBatchId, req.user.id).catch(() => {});

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
    entityType: 'INVENTORY_RECORD',
    entityId: batchId,
    metadata: {
      storeId,
      batchId,
      materials: Array.from(repeatMaterials),
      count: repeatMaterials.size,
    },
  });
}

export async function downloadInventory(req, res, next) {
  try {
    const storeId = req.user.storeId;

    // Get latest batch WHERE this store has inventory records
    const latestBatch = await prisma.uploadBatch.findFirst({
      where: {
        inventoryRecords: {
          some: { storeId },
        },
      },
      orderBy: { inventoryDate: 'desc' },
    });

    if (!latestBatch) {
      throw new AppError('No inventory records found for your store', 404);
    }

    // Get records for this store in latest batch only
    const records = await prisma.inventoryRecord.findMany({
      where: {
        storeId,
        batchId: latestBatch.id,
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
      { header: 'Store Code', key: 'storeCode', width: 12 },
      { header: 'Date', key: 'inventoryDate', width: 15 },
      { header: 'Material Name', key: 'materialCode', width: 20 },
      { header: 'Material Description', key: 'materialName', width: 30 },
      { header: 'SYS', key: 'systemQuantity', width: 12 },
      { header: 'Sold', key: 'physicalQuantity', width: 12 },
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

    await createAuditLog({
      userId: req.user.id,
      action: 'DOWNLOAD_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: latestBatch.id,
      metadata: { recordCount: records.length, batchId: latestBatch.id },
    });

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
