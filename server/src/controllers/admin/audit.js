// The audit log: reading it and exporting it.

import ExcelJS from 'exceljs';
import { AppError } from '../../middleware/errorHandler.js';
import prisma from '../../config/prisma.js';
import { parseIntParam } from '../../utils/params.js';
import { sanitizeCell } from '../../utils/excelExport.js';
import { VALID_AUDIT_ACTIONS } from './shared.js';

export async function getAuditLogs(req, res, next) {
  try {
    const { action } = req.query;
    const limit = parseIntParam(req.query.limit, 'limit', 100, 1, 500);

    if (action && !VALID_AUDIT_ACTIONS.has(action)) {
      throw new AppError('Invalid action filter', 400);
    }
    const where = action ? { action } : {};

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
}

// ── Batch management endpoints ───────────────────────────────────────────────

export async function exportAuditLogs(req, res, next) {
  try {
    const { action } = req.query;
    const limit = parseIntParam(req.query.limit, 'limit', 2000, 1, 5000);
    if (action && !VALID_AUDIT_ACTIONS.has(action)) throw new AppError('Invalid action filter', 400);
    const where = action ? { action } : {};

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { employeeId: true, name: true } } },
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Activity Log');
    ws.columns = [
      { header: 'Timestamp',   key: 'time',       width: 22 },
      { header: 'Employee ID', key: 'empId',       width: 14 },
      { header: 'User Name',   key: 'name',        width: 22 },
      { header: 'Action',      key: 'action',      width: 28 },
      { header: 'Entity Type', key: 'entityType',  width: 18 },
      { header: 'Entity ID',   key: 'entityId',    width: 10 },
      { header: 'Details',     key: 'metadata',    width: 50 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    logs.forEach(log => ws.addRow({
      time:       log.createdAt.toISOString().replace('T', ' ').substring(0, 19),
      empId:      sanitizeCell(log.user?.employeeId || '--'),
      name:       sanitizeCell(log.user?.name || 'System'),
      action:     log.action,
      entityType: log.entityType || '',
      entityId:   log.entityId ?? '',
      metadata:   log.metadata ? sanitizeCell(JSON.stringify(log.metadata)) : '',
    }));

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_ActivityLog_${date}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
}

// -- PDF Exports --
