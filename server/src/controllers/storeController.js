import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import ExcelJS from 'exceljs';
import prisma from '../config/prisma.js';

// WebSocket instance (set from server.js)
let io;
export function setSocketIO(socketIO) {
  io = socketIO;
}

export async function getDashboard(req, res, next) {
  const startTime = Date.now();
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
      include: {
        inventoryRecords: {
          where: { storeId },
          select: { id: true },
        },
      },
    });

    if (!latestBatch || latestBatch.inventoryRecords.length === 0) {
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

    // Get statistics
    const records = await prisma.inventoryRecord.findMany({
      where: {
        storeId,
        batchId: latestBatch.id,
      },
    });

    const stats = {
      totalItems: records.length,
      pendingItems: records.filter((r) => r.status === 'PENDING').length,
      submittedItems: records.filter((r) => r.status === 'SUBMITTED').length,
      matchedItems: records.filter((r) => r.difference === 0 && r.status === 'SUBMITTED').length,
      shortageItems: records.filter((r) => r.difference < 0 && r.status === 'SUBMITTED').length,
      excessItems: records.filter((r) => r.difference > 0 && r.status === 'SUBMITTED').length,
    };

    res.json({
      store: req.user.store,
      batch: {
        id: latestBatch.id,
        inventoryDate: latestBatch.inventoryDate,
        uploadedAt: latestBatch.uploadedAt,
      },
      stats,
    });
    
    const duration = Date.now() - startTime;
    console.log(`[PERF] GET_STORE_DASHBOARD: ${duration}ms`);
  } catch (error) {
    next(error);
  }
}

export async function getBatches(req, res, next) {
  try {
    const storeId = req.user.storeId;

    // Get all batches with aggregated counts in a single query
    const batches = await prisma.uploadBatch.findMany({
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
        inventoryRecords: {
          where: { storeId },
          select: {
            status: true,
          },
        },
      },
    });

    // Calculate status counts from the already-loaded records
    const batchesWithStatus = batches.map((batch) => {
      const pendingCount = batch.inventoryRecords.filter((r) => r.status === 'PENDING').length;
      const submittedCount = batch.inventoryRecords.filter((r) => r.status === 'SUBMITTED').length;

      return {
        id: batch.id,
        inventoryDate: batch.inventoryDate,
        uploadedAt: batch.uploadedAt,
        totalRecords: batch.inventoryRecords.length,
        pendingCount,
        submittedCount,
      };
    });

    res.json(batchesWithStatus);
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

    const records = await prisma.inventoryRecord.findMany({
      where,
      orderBy: { materialCode: 'asc' },
      include: {
        batch: {
          select: {
            id: true,
            inventoryDate: true,
          },
        },
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[PERF] GET_INVENTORY (${records.length} records): ${duration}ms`);

    res.json(records);
  } catch (error) {
    next(error);
  }
}

export async function updateInventoryRecord(req, res, next) {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const storeId = req.user.storeId;
    const { physicalQuantity, remarks } = req.body;

    // Validate physical quantity
    if (physicalQuantity !== null && physicalQuantity !== undefined) {
      const qty = parseFloat(physicalQuantity);
      if (isNaN(qty) || qty < 0) {
        throw new AppError('Physical quantity must be a non-negative number', 400);
      }
    }

    // Atomically find record, verify ownership, check status, and get systemQuantity
    const record = await prisma.inventoryRecord.findFirst({
      where: {
        id: parseInt(id),
        storeId, // Verify ownership atomically
      },
      select: {
        id: true,
        systemQuantity: true,
        status: true,
      },
    });

    if (!record) {
      throw new AppError('Record not found', 404);
    }

    // Prevent editing after submission
    if (record.status === 'SUBMITTED') {
      throw new AppError('Cannot edit submitted records', 403);
    }

    // Calculate difference if physical quantity is provided
    let difference = null;
    if (physicalQuantity !== null && physicalQuantity !== undefined) {
      difference = parseFloat(physicalQuantity) - record.systemQuantity;
    }

    // Update record atomically with ownership check
    const updated = await prisma.inventoryRecord.updateMany({
      where: {
        id: parseInt(id),
        storeId, // Re-verify ownership at update time
        status: 'PENDING', // Ensure still pending
      },
      data: {
        physicalQuantity: physicalQuantity !== null && physicalQuantity !== undefined 
          ? parseFloat(physicalQuantity) 
          : undefined,
        difference,
        remarks: remarks !== undefined ? remarks : undefined,
      },
    });

    if (updated.count === 0) {
      throw new AppError('Record not found or already submitted', 404);
    }

    // Fetch updated record for response
    const result = await prisma.inventoryRecord.findUnique({
      where: { id: parseInt(id) },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: parseInt(id),
      metadata: { physicalQuantity, remarks },
    });

    const duration = Date.now() - startTime;
    console.log(`[PERF] UPDATE_INVENTORY record ${id}: ${duration}ms`);

    // Emit WebSocket event to store room
    if (io) {
      io.to(`store:${storeId}`).emit('inventoryUpdate', result);
      io.to('admin').emit('inventoryChange', {
        type: 'update',
        storeId,
        recordId: result.id,
        batchId: result.batchId,
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function bulkUpdateInventory(req, res, next) {
  const startTime = Date.now();
  try {
    const storeId = req.user.storeId;
    const { batchId, changes } = req.body;

    if (!batchId || !Array.isArray(changes)) {
      throw new AppError('batchId and changes array are required', 400);
    }

    if (changes.length === 0) {
      throw new AppError('No changes provided', 400);
    }

    if (changes.length > 100) {
      throw new AppError('Maximum 100 records per bulk update', 400);
    }

    // Use transaction for atomic bulk update
    const updatedRecords = await prisma.$transaction(async (tx) => {
      const recordIds = changes.map(c => c.recordId);

      // Verify all records exist, belong to this store and batch, and are pending
      const records = await tx.inventoryRecord.findMany({
        where: {
          id: { in: recordIds },
          storeId,
          batchId: parseInt(batchId),
          status: 'PENDING',
        },
        select: {
          id: true,
          systemQuantity: true,
        },
      });

      if (records.length !== changes.length) {
        throw new AppError(
          `Authorization failed: ${changes.length - records.length} record(s) not found, unauthorized, or already submitted`,
          403
        );
      }

      // Create a map for quick lookup
      const recordMap = new Map(records.map(r => [r.id, r]));

      // Update each record
      const updates = [];
      for (const change of changes) {
        const record = recordMap.get(change.recordId);
        if (!record) continue;

        const physicalQty = change.physicalQuantity !== null && change.physicalQuantity !== undefined
          ? parseFloat(change.physicalQuantity)
          : null;

        if (physicalQty !== null && (isNaN(physicalQty) || physicalQty < 0)) {
          throw new AppError(`Invalid physicalQuantity for record ${change.recordId}`, 400);
        }

        const difference = physicalQty !== null ? physicalQty - record.systemQuantity : null;

        updates.push(
          tx.inventoryRecord.update({
            where: { id: change.recordId },
            data: {
              physicalQuantity: physicalQty,
              difference,
              remarks: change.remarks !== undefined ? change.remarks : undefined,
            },
          })
        );
      }

      return await Promise.all(updates);
    });

    // Single audit log for bulk operation
    await createAuditLog({
      userId: req.user.id,
      action: 'BULK_UPDATE_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: parseInt(batchId),
      metadata: { batchId, changedRecordCount: changes.length },
    });

    const duration = Date.now() - startTime;
    console.log(`[PERF] BULK_UPDATE_INVENTORY (${changes.length} records): ${duration}ms`);

    // Emit WebSocket event to store room
    if (io) {
      io.to(`store:${storeId}`).emit('inventoryBulkUpdate', {
        batchId: parseInt(batchId),
        updated: updatedRecords.length,
        records: updatedRecords,
      });
      io.to('admin').emit('inventoryChange', {
        type: 'bulkUpdate',
        storeId,
        batchId: parseInt(batchId),
        count: updatedRecords.length,
      });
    }

    res.json({
      updated: updatedRecords.length,
      records: updatedRecords,
    });
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

    // Use transaction for atomic submission
    const result = await prisma.$transaction(async (tx) => {
      // Get all records for this store and batch
      const records = await tx.inventoryRecord.findMany({
        where: {
          storeId,
          batchId: parseInt(batchId),
          status: 'PENDING',
        },
      });

      if (records.length === 0) {
        throw new AppError('No pending records found', 400);
      }

      // Validate all records have physical quantity
      const missingPhysicalQty = records.filter((r) => r.physicalQuantity === null);
      if (missingPhysicalQty.length > 0) {
        throw new AppError(
          `Please enter physical quantity for all items. ${missingPhysicalQty.length} items are missing.`,
          400
        );
      }

      // Submit all records atomically
      const updated = await tx.inventoryRecord.updateMany({
        where: {
          storeId,
          batchId: parseInt(batchId),
          status: 'PENDING',
        },
        data: {
          status: 'SUBMITTED',
          submittedBy: req.user.id,
          submittedAt: new Date(),
        },
      });

      return { count: updated.count };
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'SUBMIT_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: parseInt(batchId),
      metadata: { recordCount: result.count },
    });

    // Emit WebSocket event to store room and admin
    if (io) {
      io.to(`store:${storeId}`).emit('inventorySubmitted', {
        batchId: parseInt(batchId),
        count: result.count,
      });
      io.to('admin').emit('inventoryChange', {
        type: 'submit',
        storeId,
        batchId: parseInt(batchId),
        count: result.count,
      });
    }

    res.json({
      message: 'Inventory submitted successfully',
      recordCount: result.count,
    });
  } catch (error) {
    next(error);
  }
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
      { header: 'Inventory Date', key: 'inventoryDate', width: 15 },
      { header: 'Material Code', key: 'materialCode', width: 15 },
      { header: 'Material Name', key: 'materialName', width: 30 },
      { header: 'System Quantity', key: 'systemQuantity', width: 18 },
      { header: 'Physical Quantity', key: 'physicalQuantity', width: 18 },
      { header: 'Difference', key: 'difference', width: 12 },
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
