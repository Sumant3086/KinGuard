// Reconciliation reports and every Excel or PDF export built from them.

import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../services/auditService.js';
import { logger } from '../../config/logger.js';
import prisma from '../../config/prisma.js';
import { parseId, requireId } from '../../utils/params.js';
import { buildInventoryWorkbook } from '../../utils/excelExport.js';
import { EXPORT_ROW_LIMIT, VALID_DISCREPANCIES, VALID_INV_STATUSES } from './shared.js';

export async function getReconciliationReport(req, res, next) {
  try {
    const { status, discrepancy, includeInactive } = req.query;
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');

    if (status && !VALID_INV_STATUSES.has(status)) throw new AppError('Invalid status filter', 400);
    if (discrepancy && !VALID_DISCREPANCIES.has(discrepancy)) throw new AppError('Invalid discrepancy filter', 400);

    const where = { batch: { isDeleted: false } };

    if (storeId)  where.storeId = storeId;
    if (batchId)  where.batchId = batchId;
    if (status)   where.status  = status;
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    // Inactive store filter
    if (includeInactive !== 'true') where.store = { isActive: true };

    const count = await prisma.inventoryRecord.count({ where });
    if (count > EXPORT_ROW_LIMIT) {
      throw new AppError(
        `Your current filters return ${count.toLocaleString()} records. Narrow the results to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer by selecting a specific cycle or store`,
        413
      );
    }

    const records = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store:    { select: { storeCode: true, storeName: true } },
        batch:    { select: { inventoryDate: true } },
        submitter:{ select: { employeeId: true, name: true } },
      },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
    });

    res.json(records);
  } catch (error) {
    next(error);
  }
}

export async function downloadReconciliationReport(req, res, next) {
  try {
    const { status, discrepancy, includeInactive } = req.query;
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');

    if (status && !VALID_INV_STATUSES.has(status)) throw new AppError('Invalid status filter', 400);
    if (discrepancy && !VALID_DISCREPANCIES.has(discrepancy)) throw new AppError('Invalid discrepancy filter', 400);

    const where = { batch: { isDeleted: false } };

    if (storeId)  where.storeId = storeId;
    if (batchId)  where.batchId = batchId;
    if (status)   where.status  = status;
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };
    if (includeInactive !== 'true') where.store = { isActive: true };

    const dlCount = await prisma.inventoryRecord.count({ where });
    if (dlCount > EXPORT_ROW_LIMIT) {
      throw new AppError(
        `Your current filters return ${dlCount.toLocaleString()} records. Narrow the results to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer by selecting a specific cycle or store before downloading`,
        413
      );
    }

    const filtered = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store:    { select: { storeCode: true, storeName: true } },
        batch:    { select: { inventoryDate: true } },
        submitter:{ select: { employeeId: true, name: true } },
      },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
    });

    const workbook = buildInventoryWorkbook(filtered, {
      sheetName:        'Reconciliation Report',
      includeDate:      true,
      includeSubmitter: true,
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'DOWNLOAD_REPORT',
      entityType: 'INVENTORY_RECORD',
      entityId: null,
      metadata: { recordCount: filtered.length, filters: { storeId, status, discrepancy } },
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=reconciliation_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

export async function downloadInventoryExport(req, res, next) {
  const startTime = Date.now();
  try {
    const { status, search, discrepancy } = req.query;
    if (status && !VALID_INV_STATUSES.has(status)) throw new AppError('Invalid status filter', 400);
    if (discrepancy && !VALID_DISCREPANCIES.has(discrepancy)) throw new AppError('Invalid discrepancy filter', 400);
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');

    const where = { batch: { isDeleted: false } };

    if (storeId) { where.storeId = storeId; }
    if (status)  { where.status  = status;  }
    if (batchId) { where.batchId = batchId; }
    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const exportCount = await prisma.inventoryRecord.count({ where });
    if (exportCount > EXPORT_ROW_LIMIT) {
      throw new AppError(
        `Your current filters return ${exportCount.toLocaleString()} records. Narrow the results to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer by selecting a specific cycle or store before exporting`,
        413
      );
    }

    const records = await prisma.inventoryRecord.findMany({
      where,
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store:    { select: { storeCode: true, storeName: true } },
        batch:    { select: { inventoryDate: true } },
        submitter:{ select: { employeeId: true, name: true } },
      },
    });

    const workbook = buildInventoryWorkbook(records, {
      sheetName:       'Inventory Records',
      includeDate:     true,
      includeSubmitter: true,
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'DOWNLOAD_ADMIN_INVENTORY_EXPORT',
      entityType: 'INVENTORY_RECORD',
      entityId: null,
      metadata: { recordCount: records.length, filters: { storeId, status, batchId, discrepancy } },
    });

    const duration = Date.now() - startTime;
    logger.debug('Admin export built', { records: records.length, durationMs: duration });

    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const storeFilter = storeId ? `_Store_${storeId}` : '';
    const filename = `KinGuard${storeFilter}_Inventory_${date}.xlsx`;

    // Send file
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

export async function downloadInventoryExportPDF(req, res, next) {
  try {
    const { status, discrepancy, search } = req.query;
    if (status && !VALID_INV_STATUSES.has(status)) throw new AppError('Invalid status filter', 400);
    if (discrepancy && !new Set(['shortage','excess','matched']).has(discrepancy)) throw new AppError('Invalid discrepancy filter', 400);
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');
    const where = { batch: { isDeleted: false } };
    if (storeId)     where.storeId  = storeId;
    if (status)      where.status   = status;
    if (batchId)     where.batchId  = batchId;
    if (search)      where.OR = [
      { materialCode: { contains: search, mode: 'insensitive' } },
      { materialName: { contains: search, mode: 'insensitive' } },
    ];
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const pdfExportCount = await prisma.inventoryRecord.count({ where });
    if (pdfExportCount > EXPORT_ROW_LIMIT) {
      throw new AppError(`This filter matches ${pdfExportCount.toLocaleString()} records. Apply more specific filters to reduce to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer.`, 413);
    }

    const records = await prisma.inventoryRecord.findMany({
      where,
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: { select: { storeCode: true, storeName: true } },
        batch: { select: { inventoryDate: true } },
      },
    });

    const { buildPDF, baseDocDef, inventoryTableContent } = await import('../../services/pdfService.js');
    const today = new Date().toISOString().split('T')[0];

    const pdfBuffer = await buildPDF({
      ...baseDocDef({ title: 'Inventory Submissions', subtitle: `${records.length} records - ${today}` }),
      content: [inventoryTableContent(records)],
    });

    await createAuditLog({
      userId: req.user.id, action: 'DOWNLOAD_INVENTORY_PDF',
      entityType: 'INVENTORY_RECORD', entityId: null,
      metadata: { recordCount: records.length, filters: { storeId, status, batchId, discrepancy } },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_Inventory_${today}.pdf"`);
    res.end(pdfBuffer);
  } catch (error) { next(error); }
}

export async function downloadReconciliationReportPDF(req, res, next) {
  try {
    const { status, discrepancy } = req.query;
    if (status && !VALID_INV_STATUSES.has(status)) throw new AppError('Invalid status filter', 400);
    if (discrepancy && !new Set(['shortage','excess','matched']).has(discrepancy)) throw new AppError('Invalid discrepancy filter', 400);
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');
    const where = { batch: { isDeleted: false } };
    if (storeId)  where.storeId = storeId;
    if (batchId)  where.batchId = batchId;
    if (status)   where.status  = status;
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const reconPdfCount = await prisma.inventoryRecord.count({ where });
    if (reconPdfCount > EXPORT_ROW_LIMIT) {
      throw new AppError(`This filter matches ${reconPdfCount.toLocaleString()} records. Apply more specific filters to reduce to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer.`, 413);
    }

    const records = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store: { select: { storeCode: true, storeName: true } },
        batch: { select: { inventoryDate: true } },
      },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
    });

    const { buildPDF, baseDocDef, inventoryTableContent } = await import('../../services/pdfService.js');
    const today = new Date().toISOString().split('T')[0];

    const pdfBuffer = await buildPDF({
      ...baseDocDef({ title: 'Reconciliation Report', subtitle: `${records.length} records - ${today}` }),
      content: [inventoryTableContent(records)],
    });

    await createAuditLog({
      userId: req.user.id, action: 'DOWNLOAD_REPORT_PDF',
      entityType: 'INVENTORY_RECORD', entityId: null,
      metadata: { recordCount: records.length, filters: { storeId, status, discrepancy } },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="KinMarche_Reconciliation_${today}.pdf"`);
    res.end(pdfBuffer);
  } catch (error) { next(error); }
}

export async function downloadBatchExportPDF(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');
    const batch = await prisma.uploadBatch.findFirst({
      where: { id: batchId, isDeleted: false },
      select: { inventoryDate: true },
    });
    if (!batch) throw new AppError('Batch not found', 404);

    const records = await prisma.inventoryRecord.findMany({
      where: { batchId },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: { select: { storeCode: true, storeName: true } },
        batch: { select: { inventoryDate: true } },
      },
    });

    const { buildPDF, baseDocDef, inventoryTableContent } = await import('../../services/pdfService.js');
    const dateStr = batch.inventoryDate.toISOString().split('T')[0];

    const pdfBuffer = await buildPDF({
      ...baseDocDef({ title: 'Cycle Export', subtitle: `Date: ${dateStr} - ${records.length} records` }),
      content: [inventoryTableContent(records)],
    });

    await createAuditLog({
      userId: req.user.id, action: 'DOWNLOAD_BATCH_EXPORT_PDF',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { recordCount: records.length, date: dateStr },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_Cycle_${dateStr}.pdf"`);
    res.end(pdfBuffer);
  } catch (error) { next(error); }
}
