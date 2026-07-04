import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();

export async function getDashboard(req, res, next) {
  try {
    const storeId = req.user.storeId;

    // Get latest batch for this store
    const latestBatch = await prisma.uploadBatch.findFirst({
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
  } catch (error) {
    next(error);
  }
}

export async function getInventory(req, res, next) {
  try {
    const storeId = req.user.storeId;
    const { search, status } = req.query;

    const where = { storeId };

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

    res.json(records);
  } catch (error) {
    next(error);
  }
}

export async function updateInventoryRecord(req, res, next) {
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

    // Find record and verify ownership
    const record = await prisma.inventoryRecord.findUnique({
      where: { id: parseInt(id) },
    });

    if (!record || record.storeId !== storeId) {
      throw new AppError('Record not found', 404);
    }

    // Calculate difference if physical quantity is provided
    let difference = null;
    if (physicalQuantity !== null && physicalQuantity !== undefined) {
      difference = parseFloat(physicalQuantity) - record.systemQuantity;
    }

    // Update record
    const updated = await prisma.inventoryRecord.update({
      where: { id: parseInt(id) },
      data: {
        physicalQuantity: physicalQuantity !== null && physicalQuantity !== undefined 
          ? parseFloat(physicalQuantity) 
          : undefined,
        difference,
        remarks: remarks !== undefined ? remarks : undefined,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: updated.id,
      metadata: { physicalQuantity, remarks },
    });

    res.json(updated);
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

    // Get all records for this store and batch
    const records = await prisma.inventoryRecord.findMany({
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

    // Submit all records
    await prisma.inventoryRecord.updateMany({
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

    await createAuditLog({
      userId: req.user.id,
      action: 'SUBMIT_INVENTORY',
      entityType: 'INVENTORY_RECORD',
      entityId: parseInt(batchId),
      metadata: { recordCount: records.length },
    });

    res.json({
      message: 'Inventory submitted successfully',
      recordCount: records.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadInventory(req, res, next) {
  try {
    const storeId = req.user.storeId;

    // Get records for this store only
    const records = await prisma.inventoryRecord.findMany({
      where: { storeId },
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
      entityId: null,
      metadata: { recordCount: records.length },
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
