import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import prisma from '../config/prisma.js';
import { sGet, sSet, sInvalidate } from '../services/serverCache.js';

// Shared column name aliases for Excel/CSV parsing
const COLUMN_MAP = {
  storeCode:      ['Plant', 'Store Code', 'Store code', 'StoreCode', 'Store', 'store_code', 'STORE CODE'],
  materialCode:   ['Material', 'Material Code', 'Material code', 'MaterialCode', 'material_code', 'SKU', 'MATERIAL'],
  materialName:   ['Material Description', 'Material Name', 'MaterialName', 'Description', 'material_name', 'MATERIAL DESCRIPTION'],
  systemQuantity: ['System  Stock', 'System Stock', 'SYS', 'System Quantity', 'SystemQuantity', 'system_quantity', 'QTY', 'SYSTEM QUANTITY'],
  remarks:        ['col_10', 'Remarks', 'remarks', 'REMARKS', 'Remark', 'Note'],
};

function findColumn(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name];
    }
  }
  return null;
}

// Safely extract plain text from any ExcelJS cell value.
// Handles: plain string, number, boolean, RichText ({richText:[{text}]}), Hyperlink ({text}).
function cellText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string')  return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val?.richText)) return val.richText.map(r => r.text ?? '').join('').trim();
  if (val?.text !== undefined)  return String(val.text).trim();
  return String(val).trim();
}

async function parseFileToRows(file) {
  if (file.mimetype.includes('csv')) {
    return parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const worksheet = workbook.worksheets[0];
  // Map column number -> header name; bold/rich-text headers are flattened to plain string
  const headerMap = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headerMap[colNumber] = cellText(cell.value) || `col_${colNumber}`;
  });
  const rows = [];
  worksheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) return;
    const rowData = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headerMap[colNumber] ?? `col_${colNumber}`;
      // Flatten RichText data cells too (e.g. bold material codes)
      const v = cell.value;
      rowData[key] = (v && typeof v === 'object' && (Array.isArray(v.richText) || v.text !== undefined))
        ? cellText(v)
        : v;
    });
    if (Object.keys(rowData).length > 0) rows.push(rowData);
  });
  return rows;
}

export async function getDashboard(req, res, next) {
  const startTime = Date.now();
  try {
    const cached = sGet('admin:dashboard');
    if (cached) {
      
      return res.json(cached);
    }

    const [totalStores, latestBatch] = await Promise.all([
      prisma.store.count({ where: { isActive: true } }),
      prisma.uploadBatch.findFirst({
        orderBy: { inventoryDate: 'desc' },
        select: { id: true, inventoryDate: true, submissionDeadline: true },
      }),
    ]);

    if (!latestBatch) {
      return res.json({
        totalStores,
        currentBatch: null,
        storeScorecard: [],
        hotspots: [],
        networkSummary: { totalRecords: 0, matchedItems: 0, shortageItems: 0, excessItems: 0 },
      });
    }

    const now = new Date();
    const isDeadlinePassed = latestBatch.submissionDeadline
      ? now > new Date(latestBatch.submissionDeadline)
      : false;

    // Per-store stats for the latest batch
    const [perStoreStats, networkStats, allStores] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          ir."storeId",
          COUNT(*)::int                                          AS "totalItems",
          COUNT(CASE WHEN ir.status = 'SUBMITTED' THEN 1 END)::int AS "submittedCount",
          COUNT(CASE WHEN ir.status = 'PENDING'   THEN 1 END)::int AS "pendingCount",
          COUNT(CASE WHEN ir.difference < 0 AND ir.status = 'SUBMITTED' THEN 1 END)::int AS "shortageCount",
          COUNT(CASE WHEN ir.difference = 0 AND ir.status = 'SUBMITTED' THEN 1 END)::int AS "matchedCount",
          COUNT(CASE WHEN ir.difference > 0 AND ir.status = 'SUBMITTED' THEN 1 END)::int AS "excessCount"
        FROM "InventoryRecord" ir
        WHERE ir."batchId" = ${latestBatch.id}
        GROUP BY ir."storeId"
      `,
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int                                                  AS "totalRecords",
          COUNT(CASE WHEN difference = 0  AND status = 'SUBMITTED' THEN 1 END)::int AS "matchedItems",
          COUNT(CASE WHEN difference < 0  AND status = 'SUBMITTED' THEN 1 END)::int AS "shortageItems",
          COUNT(CASE WHEN difference > 0  AND status = 'SUBMITTED' THEN 1 END)::int AS "excessItems"
        FROM "InventoryRecord"
        WHERE "batchId" = ${latestBatch.id}
      `,
      prisma.store.findMany({ where: { isActive: true }, select: { id: true, storeCode: true, storeName: true } }),
    ]);

    // Top remark per store + last 4 batches " run in parallel (B5)
    const [topRemarkRows, last4Batches] = await Promise.all([
      prisma.$queryRaw`
        SELECT "storeId", remarks, COUNT(*)::int AS cnt
        FROM "InventoryRecord"
        WHERE "batchId" = ${latestBatch.id} AND status = 'SUBMITTED' AND remarks IS NOT NULL AND remarks <> ''
        GROUP BY "storeId", remarks
        ORDER BY "storeId", cnt DESC
      `,
      prisma.uploadBatch.findMany({
        orderBy: { inventoryDate: 'desc' },
        take: 4,
        select: { id: true },
      }),
    ]);

    const topRemarkMap = new Map();
    topRemarkRows.forEach((r) => {
      const sid = Number(r.storeId);
      if (!topRemarkMap.has(sid)) topRemarkMap.set(sid, r.remarks);
    });

    // Normalise storeId keys from raw SQL to Number to match Prisma ORM ids
    const statsMap = new Map(perStoreStats.map((r) => [Number(r.storeId), r]));

    const storeScorecard = allStores.map((store) => {
      const s = statsMap.get(store.id);
      const totalItems    = s ? s.totalItems    : 0;
      const shortageCount = s ? s.shortageCount : 0;
      const shortageRate  = totalItems > 0 ? Math.round((shortageCount / totalItems) * 100) : 0;
      const isSubmitted   = s ? s.pendingCount === 0 && s.submittedCount > 0 : false;
      const isPending     = s ? s.pendingCount > 0 : false;
      const riskLevel     = shortageRate >= 20 ? 'RED' : shortageRate >= 5 ? 'YELLOW' : 'GREEN';
      return {
        storeId: store.id,
        storeCode: store.storeCode,
        storeName: store.storeName,
        totalItems,
        shortageCount,
        shortageRate,
        matchedCount: s ? s.matchedCount : 0,
        excessCount:  s ? s.excessCount  : 0,
        topRemark:    topRemarkMap.get(store.id) || null,
        status:    isSubmitted ? 'SUBMITTED' : isPending ? 'PENDING' : 'NO_DATA',
        isOverdue: isDeadlinePassed && isPending,
        riskLevel,
      };
    }).sort((a, b) => b.shortageRate - a.shortageRate);

    // Shrinkage hotspots: (storeId, materialCode) pairs with shortages in 2 of the last 4 batches.
    const batchIds = last4Batches.map((b) => b.id);

    let hotspots = [];
    if (batchIds.length >= 2) {
      const shortageRows = await prisma.inventoryRecord.findMany({
        where: {
          batchId:    { in: batchIds },
          status:     'SUBMITTED',
          difference: { lt: 0 },
        },
        select: {
          storeId:      true,
          materialCode: true,
          materialName: true,
          difference:   true,
          remarks:      true,
          batchId:      true,
          store: { select: { storeCode: true, storeName: true } },
        },
      });

      const pairMap = new Map();
      shortageRows.forEach((r) => {
        const key = `${r.storeId}::${r.materialCode}`;
        if (!pairMap.has(key)) {
          pairMap.set(key, {
            storeCode:    r.store.storeCode,
            storeName:    r.store.storeName,
            materialCode: r.materialCode,
            materialName: r.materialName,
            batches:      new Set(),
            totalShortage: 0,
            remarkCounts: {},
          });
        }
        const p = pairMap.get(key);
        p.batches.add(r.batchId);
        p.totalShortage += Math.abs(r.difference);
        if (r.remarks) p.remarkCounts[r.remarks] = (p.remarkCounts[r.remarks] || 0) + 1;
      });

      hotspots = Array.from(pairMap.values())
        .filter((p) => p.batches.size >= 2)
        .map((p) => ({
          storeCode:     p.storeCode,
          storeName:     p.storeName,
          materialCode:  p.materialCode,
          materialName:  p.materialName,
          batchCount:    p.batches.size,
          totalShortage: Math.round(p.totalShortage * 10) / 10,
          dominantRemark: Object.entries(p.remarkCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        }))
        .sort((a, b) => b.batchCount - a.batchCount || b.totalShortage - a.totalShortage)
        .slice(0, 5);
    }

    const net = networkStats[0] || {};
    const storesPending = storeScorecard.filter((s) => s.status === 'PENDING').length;
    const storesSubmitted = storeScorecard.filter((s) => s.status === 'SUBMITTED').length;
    const overdueStores = storeScorecard.filter((s) => s.isOverdue).map((s) => s.storeName);

    const duration = Date.now() - startTime;
    console.log(`[PERF] GET_ADMIN_DASHBOARD: ${duration}ms`);

    const result = {
      totalStores,
      currentBatch: {
        id: latestBatch.id,
        inventoryDate: latestBatch.inventoryDate,
        submissionDeadline: latestBatch.submissionDeadline,
        storesPending,
        storesSubmitted,
        overdueStores,
        isDeadlinePassed,
      },
      storeScorecard,
      hotspots,
      networkSummary: {
        totalRecords: Number(net.totalRecords || 0),
        matchedItems: Number(net.matchedItems || 0),
        shortageItems: Number(net.shortageItems || 0),
        excessItems: Number(net.excessItems || 0),
      },
    };
    sSet('admin:dashboard', result, 30_000);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getStores(req, res, next) {
  try {
    const stores = await prisma.store.findMany({
      orderBy: { storeCode: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            inventoryRecords: true,
          },
        },
      },
    });

    
    res.json(stores);
  } catch (error) {
    next(error);
  }
}

export async function createStore(req, res, next) {
  try {
    const { storeCode, storeName, isActive } = req.body;

    if (!storeCode || !storeName) {
      throw new AppError('Store code and name are required', 400);
    }

    const store = await prisma.store.create({
      data: {
        storeCode: storeCode.toString(),
        storeName,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_STORE',
      entityType: 'STORE',
      entityId: store.id,
      metadata: { storeCode, storeName },
    });

    sInvalidate('admin:dashboard');
    res.status(201).json(store);
  } catch (error) {
    if (error.code === 'P2002') {
      next(new AppError('Store code already exists', 409));
    } else {
      next(error);
    }
  }
}

export async function deleteStore(req, res, next) {
  try {
    const { id } = req.params;
    const storeId = parseInt(id);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { _count: { select: { inventoryRecords: true, users: true } } },
    });

    if (!store) throw new AppError('Store not found', 404);

    if (store._count.inventoryRecords > 0) {
      throw new AppError(
        `Cannot delete store -- it has ${store._count.inventoryRecords} inventory record(s). Deactivate it instead.`,
        409
      );
    }

    // Remove dependent records (no inventory, so these are safe to clear)
    await prisma.batchDeadlineExtension.deleteMany({ where: { storeId } });
    if (store._count.users > 0) {
      await prisma.user.updateMany({ where: { storeId }, data: { storeId: null } });
    }

    await prisma.store.delete({ where: { id: storeId } });

    await createAuditLog({
      userId: req.user.id,
      action: 'DELETE_STORE',
      entityType: 'STORE',
      entityId: storeId,
      metadata: { storeCode: store.storeCode, storeName: store.storeName },
    });

    sInvalidate('admin:dashboard');
    res.json({ message: 'Store deleted' });
  } catch (error) {
    next(error);
  }
}

export async function updateStore(req, res, next) {
  try {
    const { id } = req.params;
    const { storeName, isActive } = req.body;

    const store = await prisma.store.update({
      where: { id: parseInt(id) },
      data: {
        storeName: storeName !== undefined ? storeName : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_STORE',
      entityType: 'STORE',
      entityId: store.id,
      metadata: { storeName, isActive },
    });

    sInvalidate('admin:dashboard');
    res.json(store);
  } catch (error) {
    next(error);
  }
}

export async function getUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { employeeId: 'asc' },
      include: {
        store: {
          select: {
            id: true,
            storeCode: true,
            storeName: true,
          },
        },
      },
    });

    
    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function createUser(req, res, next) {
  try {
    const { employeeId, name, password, role, storeId, isActive, email, phone } = req.body;

    if (!employeeId || !name || !password || !role) {
      throw new AppError('Employee ID, name, password, and role are required', 400);
    }

    if (role === 'STORE_MANAGER' && !storeId) {
      throw new AppError('Store assignment is required for Store Managers', 400);
    }

    if (role === 'ADMIN' && storeId) {
      throw new AppError('Admin users cannot be assigned to a store', 400);
    }

    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        employeeId,
        name,
        passwordHash,
        role,
        storeId: storeId ? parseInt(storeId) : null,
        isActive: isActive !== undefined ? isActive : true,
        email: email || null,
        phone: phone || null,
      },
      include: {
        store: true,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_USER',
      entityType: 'USER',
      entityId: user.id,
      metadata: { employeeId, role, storeId },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.code === 'P2002') {
      next(new AppError('Employee ID already exists', 409));
    } else {
      next(error);
    }
  }
}

export async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, password, storeId, isActive, email, phone } = req.body;

    const data = {
      name:     name     !== undefined ? name     : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
      email:    email    !== undefined ? (email || null)  : undefined,
      phone:    phone    !== undefined ? (phone || null)  : undefined,
    };

    if (storeId !== undefined) {
      if (storeId) {
        data.store = { connect: { id: parseInt(storeId) } };
      } else {
        // Only issue disconnect if the user actually has a store -- Prisma P2025
        // is thrown when disconnecting an already-null optional relation.
        const current = await prisma.user.findUnique({
          where: { id: parseInt(id) },
          select: { storeId: true },
        });
        if (current?.storeId) {
          data.store = { disconnect: true };
        }
      }
    }

    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data,
      include: { store: true },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_USER',
      entityType: 'USER',
      entityId: user.id,
      metadata: { name, storeId, isActive },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    next(error);
  }
}

export async function uploadInventory(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('File is required', 400);
    }

    const { inventoryDate, submissionDeadline } = req.body;
    if (!inventoryDate) {
      throw new AppError('Inventory date is required', 400);
    }

    // Check if a batch already exists within 3 days of this inventory date (B7)
    const targetDate = new Date(inventoryDate);
    const windowStart = new Date(targetDate); windowStart.setDate(windowStart.getDate() - 3);
    const windowEnd   = new Date(targetDate); windowEnd.setDate(windowEnd.getDate() + 3);
    const existingBatch = await prisma.uploadBatch.findFirst({
      where: { inventoryDate: { gte: windowStart, lte: windowEnd } },
      select: { id: true, inventoryDate: true, originalFileName: true },
    });
    if (existingBatch) {
      if (req.query.force !== 'true') {
        return res.status(409).json({
          warning: 'duplicate_batch',
          message: `A batch already exists for ${new Date(existingBatch.inventoryDate).toLocaleDateString()}. Send with ?force=true to proceed anyway.`,
          existingBatch: { id: existingBatch.id, inventoryDate: existingBatch.inventoryDate, fileName: existingBatch.originalFileName },
        });
      }
    }

    const file = req.file;
    const rows = await parseFileToRows(file);

    if (rows.length > 0) {
      console.log('" Upload Headers:', Object.keys(rows[0]));
    }

    // Create upload batch
    const batch = await prisma.uploadBatch.create({
      data: {
        originalFileName: file.originalname,
        uploadedBy: req.user.id,
        inventoryDate: new Date(inventoryDate),
        submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null,
        totalRows: rows.length,
        successfulRows: 0,
        rejectedRows: 0,
        status: 'PENDING',
      },
    });

    const errors = [];
    const successfulRecords = [];

    // Auto-create any stores found in the file that don't exist yet
    const fileStoreCodes = new Set();
    for (const row of rows) {
      const code = findColumn(row, COLUMN_MAP.storeCode)?.toString().trim();
      if (code) fileStoreCodes.add(code);
    }
    const existingStores = await prisma.store.findMany({ select: { id: true, storeCode: true } });
    const existingCodes = new Set(existingStores.map(s => s.storeCode));
    const newStoreCodes = [...fileStoreCodes].filter(c => !existingCodes.has(c));
    if (newStoreCodes.length > 0) {
      await prisma.store.createMany({
        data: newStoreCodes.map(code => ({ storeCode: code, storeName: `Store ${code}`, isActive: true })),
        skipDuplicates: true,
      });
    }

    // Reload store map after potential creation
    const allStores = await prisma.store.findMany({ select: { id: true, storeCode: true } });
    const storeMap = new Map(allStores.map(s => [s.storeCode, s.id]));

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header row and 0-index

      try {
        const storeCode = findColumn(row, COLUMN_MAP.storeCode)?.toString().trim();
        const materialCode = findColumn(row, COLUMN_MAP.materialCode)?.toString().trim();
        const materialDescription = findColumn(row, COLUMN_MAP.materialName)?.toString().trim();
        const rawQty = findColumn(row, COLUMN_MAP.systemQuantity);
        const materialName = materialDescription || materialCode;

        if (!storeCode) {
          errors.push({ row: rowNum, error: 'Missing Plant / Store Code' });
          continue;
        }
        if (!materialCode) {
          errors.push({ row: rowNum, error: 'Missing Material Code' });
          continue;
        }
        if (!materialName) {
          errors.push({ row: rowNum, error: 'Missing Material Description' });
          continue;
        }

        // System quantity is optional " default to 0 when not in the file
        const qty = (rawQty !== null && rawQty !== undefined && rawQty !== '')
          ? parseFloat(rawQty)
          : 0;
        if (isNaN(qty) || qty < 0) {
          errors.push({ row: rowNum, error: 'Invalid System Quantity' });
          continue;
        }

        const storeId = storeMap.get(storeCode);
        if (!storeId) {
          errors.push({ row: rowNum, error: `Store not found: ${storeCode}` });
          continue;
        }

        const remarks = findColumn(row, COLUMN_MAP.remarks)?.toString().trim() || null;

        successfulRecords.push({
          batchId: batch.id,
          storeId,
          materialCode,
          materialName,
          systemQuantity: qty,
          remarks,
          status: 'PENDING',
        });
      } catch (error) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    // Insert successful records " skipDuplicates prevents re-uploading the same
    // (batch, store, material) from creating duplicate rows
    if (successfulRecords.length > 0) {
      await prisma.inventoryRecord.createMany({
        data: successfulRecords,
        skipDuplicates: true,
      });
    }

    // Update batch
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: {
        successfulRows: successfulRecords.length,
        rejectedRows: errors.length,
        status: errors.length === rows.length ? 'FAILED' : 'COMPLETED',
      },
    });

    await createAuditLog({
      userId: req.user.id,
      action: 'UPLOAD_INVENTORY',
      entityType: 'UPLOAD_BATCH',
      entityId: batch.id,
      metadata: {
        fileName: file.originalname,
        totalRows: rows.length,
        successfulRows: successfulRecords.length,
        rejectedRows: errors.length,
      },
    });

    sInvalidate('admin:dashboard');

    // Fire-and-forget: email only managers of stores that have records in this batch
    const affectedStoreIds = [...new Set(successfulRecords.map(r => r.storeId))];
    prisma.user.findMany({
      where: { role: 'STORE_MANAGER', isActive: true, storeId: { in: affectedStoreIds } },
      include: { store: true },
    }).then(managers => {
      import('../services/emailService.js').then(({ sendNewCycleEmail }) => {
        sendNewCycleEmail({ managers, inventoryDate, deadline: submissionDeadline || null });
      });
    }).catch(() => {});

    res.status(201).json({
      batchId: batch.id,
      totalRows: rows.length,
      successfulRows: successfulRecords.length,
      rejectedRows: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    next(error);
  }
}

export async function previewUpload(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('File is required', 400);
    }

    const { inventoryDate } = req.body;
    if (!inventoryDate) {
      throw new AppError('Inventory date is required', 400);
    }

    const file = req.file;
    const rows = await parseFileToRows(file);

    if (rows.length === 0) {
      throw new AppError('No data rows found in file', 400);
    }

    console.log('" Preview Headers:', Object.keys(rows[0]));

    // Fetch all store codes for validation
    const stores = await prisma.store.findMany({
      select: { storeCode: true, storeName: true },
    });
    const storeMap = new Map(stores.map(s => [s.storeCode, s.storeName]));

    const preview = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    // Process each row for preview (limit to first 100 for performance)
    const previewLimit = Math.min(rows.length, 100);
    for (let i = 0; i < previewLimit; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 for header row and 0-index

      const storeCode = findColumn(row, COLUMN_MAP.storeCode)?.toString().trim();
      const materialCode = findColumn(row, COLUMN_MAP.materialCode)?.toString().trim();
      const materialDescription = findColumn(row, COLUMN_MAP.materialName)?.toString().trim();
      const rawQty = findColumn(row, COLUMN_MAP.systemQuantity);
      const materialName = materialDescription || materialCode;
      const remarks = findColumn(row, COLUMN_MAP.remarks)?.toString().trim() || '';

      let status = 'valid';
      let message = '';
      const errors = [];
      const warnings = [];

      // Validation
      if (!storeCode) {
        errors.push('Missing Plant / Store Code');
      } else if (!storeMap.has(storeCode)) {
        warnings.push(`New store will be created: ${storeCode}`);
      }

      if (!materialCode) {
        errors.push('Missing Material Code');
      }

      // System quantity is optional " default 0 when absent
      if (rawQty === null || rawQty === undefined || rawQty === '') {
        warnings.push('System qty not in file " defaults to 0');
      } else {
        const qty = parseFloat(rawQty);
        if (isNaN(qty)) {
          errors.push('Invalid System Quantity (not a number)');
        } else if (qty < 0) {
          errors.push('Invalid System Quantity (negative)');
        }
      }

      if (errors.length > 0) {
        status = 'error';
        message = errors.join('; ');
        errorCount++;
      } else if (warnings.length > 0) {
        status = 'warning';
        message = warnings.join('; ');
        warningCount++;
      } else {
        status = 'valid';
        message = 'OK';
        validCount++;
      }

      preview.push({
        row: rowNum,
        storeCode: storeCode || '',
        storeName: storeCode ? (storeMap.get(storeCode) || `(new) ${storeCode}`) : '',
        materialCode: materialCode || '',
        materialName: materialName || '',
        systemQuantity: (rawQty !== null && rawQty !== undefined && rawQty !== '') ? rawQty : '0',
        remarks,
        status,
        message,
      });
    }

    res.json({
      fileName: file.originalname,
      inventoryDate,
      totalRows: rows.length,
      previewRows: preview.length,
      statistics: {
        valid: validCount,
        errors: errorCount,
        warnings: warningCount,
      },
      preview,
      showingPartial: rows.length > 100,
    });
  } catch (error) {
    next(error);
  }
}

export async function getUploads(req, res, next) {
  try {
    const uploads = await prisma.uploadBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploader: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
    });

    res.json(uploads);
  } catch (error) {
    next(error);
  }
}

export async function getInventory(req, res, next) {
  const startTime = Date.now();
  try {
    const { storeId, status, search, batchId, discrepancy, page = 1, pageSize = 50 } = req.query;

    const where = {};

    if (storeId)  where.storeId  = parseInt(storeId);
    if (status)   where.status   = status;
    if (batchId)  where.batchId  = parseInt(batchId);
    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const pageNum     = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const skip        = (pageNum - 1) * pageSizeNum;

    const [totalRecords, records] = await Promise.all([
      prisma.inventoryRecord.count({ where }),
      prisma.inventoryRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSizeNum,
        include: {
          store: { select: { storeCode: true, storeName: true } },
        },
      }),
    ]);

    // Attach repeat discrepancy flag " only check shortages in current page (B4)
    const shortageKeys = new Set(
      records
        .filter(r => r.difference !== null && r.difference < 0 && r.status === 'SUBMITTED')
        .map(r => `${r.storeId}::${r.materialCode}`)
    );

    let repeatKeys = new Set();
    if (shortageKeys.size > 0) {
      const shortageRecords = records.filter(r => r.difference !== null && r.difference < 0);
      const storeIds = [...new Set(shortageRecords.map(r => r.storeId))];
      const materialCodes = [...new Set(shortageRecords.map(r => r.materialCode))];
      const currentBatchIds = records.map(r => r.batchId).filter((v, i, a) => a.indexOf(v) === i);

      const priorShortages = await prisma.inventoryRecord.findMany({
        where: {
          storeId: { in: storeIds },
          materialCode: { in: materialCodes },
          status: 'SUBMITTED',
          difference: { lt: 0 },
          batchId: { notIn: currentBatchIds },
        },
        select: { storeId: true, materialCode: true },
        distinct: ['storeId', 'materialCode'],
      });
      repeatKeys = new Set(priorShortages.map(r => `${r.storeId}::${r.materialCode}`));
    }

    const enrichedRecords = records.map(r => ({
      ...r,
      isRepeat: repeatKeys.has(`${r.storeId}::${r.materialCode}`),
    }));

    const duration = Date.now() - startTime;
    console.log(`[PERF] GET_ADMIN_INVENTORY (${records.length} records, page ${pageNum}): ${duration}ms`);

    res.json({
      data: enrichedRecords,
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

export async function getReconciliationReport(req, res, next) {
  try {
    const { storeId, status, discrepancy, includeInactive } = req.query;

    const where = {};

    if (storeId) {
      where.storeId = parseInt(storeId);
    }
    if (status) {
      where.status = status;
    }
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    // I1: inactive store filter
    if (includeInactive !== 'true') where.store = { isActive: true };

    const records = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
        batch: {
          select: {
            inventoryDate: true,
          },
        },
        submitter: {
          select: {
            employeeId: true,
            name: true,
          },
        },
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
    const { storeId, status, discrepancy } = req.query;

    const where = {};

    if (storeId) {
      where.storeId = parseInt(storeId);
    }
    if (status) {
      where.status = status;
    }
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const filtered = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
        batch: {
          select: {
            inventoryDate: true,
          },
        },
        submitter: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reconciliation Report');

    // Add headers
    worksheet.columns = [
      { header: 'Store Code', key: 'storeCode', width: 12 },
      { header: 'Store Name', key: 'storeName', width: 20 },
      { header: 'Date', key: 'inventoryDate', width: 15 },
      { header: 'Material Name', key: 'materialCode', width: 20 },
      { header: 'Material Description', key: 'materialName', width: 30 },
      { header: 'System Stock', key: 'systemQuantity', width: 14 },
      { header: 'Physical Stock', key: 'physicalQuantity', width: 14 },
      { header: 'Diff', key: 'difference', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Submitted By', key: 'submittedBy', width: 20 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data
    filtered.forEach((record) => {
      worksheet.addRow({
        storeCode: record.store.storeCode,
        storeName: record.store.storeName,
        inventoryDate: record.batch.inventoryDate.toISOString().split('T')[0],
        materialCode: record.materialCode,
        materialName: record.materialName,
        systemQuantity: record.systemQuantity,
        physicalQuantity: record.physicalQuantity,
        difference: record.difference,
        remarks: record.remarks,
        status: record.status,
        submittedBy: record.submitter ? record.submitter.name : '',
        submittedAt: record.submittedAt ? record.submittedAt.toISOString() : '',
      });
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
    const { storeId, status, search, batchId, discrepancy } = req.query;

    const where = {};

    if (storeId) {
      where.storeId = parseInt(storeId);
    }
    if (status) {
      where.status = status;
    }
    if (batchId) {
      where.batchId = parseInt(batchId);
    }
    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    // Fetch all matching records (no pagination limit for export)
    const records = await prisma.inventoryRecord.findMany({
      where,
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: {
          select: {
            storeCode: true,
            storeName: true,
          },
        },
        batch: {
          select: {
            inventoryDate: true,
          },
        },
        submitter: {
          select: {
            employeeId: true,
            name: true,
          },
        },
      },
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory Records');

    // Define columns with business-friendly names
    worksheet.columns = [
      { header: 'Store Code', key: 'storeCode', width: 12 },
      { header: 'Store Name', key: 'storeName', width: 25 },
      { header: 'Date', key: 'inventoryDate', width: 15 },
      { header: 'Material Name', key: 'materialCode', width: 20 },
      { header: 'Material Description', key: 'materialName', width: 35 },
      { header: 'System Stock', key: 'sys', width: 14 },
      { header: 'Physical Stock', key: 'sold', width: 14 },
      { header: 'Diff', key: 'diff', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Submitted By', key: 'submittedBy', width: 20 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Enable AutoFilter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 12 },
    };

    // Add data rows
    records.forEach((record) => {
      worksheet.addRow({
        storeCode: record.store.storeCode,
        storeName: record.store.storeName,
        inventoryDate: record.batch.inventoryDate.toISOString().split('T')[0],
        materialCode: record.materialCode,
        materialName: record.materialName,
        sys: record.systemQuantity,
        sold: record.physicalQuantity !== null ? record.physicalQuantity : '',
        diff: record.difference !== null ? record.difference : '',
        remarks: record.remarks || '',
        status: record.status,
        submittedBy: record.submitter ? `${record.submitter.name} (${record.submitter.employeeId})` : '',
        submittedAt: record.submittedAt ? record.submittedAt.toISOString().replace('T', ' ').substring(0, 19) : '',
      });
    });

    // Format Store Code and Material Code as text to preserve leading zeros
    const storeCodeCol = worksheet.getColumn('storeCode');
    storeCodeCol.numFmt = '@';
    const materialCodeCol = worksheet.getColumn('materialCode');
    materialCodeCol.numFmt = '@';

    await createAuditLog({
      userId: req.user.id,
      action: 'DOWNLOAD_ADMIN_INVENTORY_EXPORT',
      entityType: 'INVENTORY_RECORD',
      entityId: null,
      metadata: { recordCount: records.length, filters: { storeId, status, batchId, discrepancy } },
    });

    const duration = Date.now() - startTime;
    console.log(`[PERF] DOWNLOAD_ADMIN_EXPORT (${records.length} records): ${duration}ms`);

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

export async function getAuditLogs(req, res, next) {
  try {
    const { action, limit = 100 } = req.query;

    const where = action ? { action } : {};

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
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

// """ C1: New batch management endpoints """""""""""""""""""""""""""""""""""""""

export async function getBatches(req, res, next) {
  try {
    const batches = await prisma.uploadBatch.findMany({
      orderBy: { inventoryDate: 'desc' },
      include: {
        uploader: { select: { name: true, employeeId: true } },
        _count: { select: { inventoryRecords: true } },
        deadlineExtensions: { select: { storeId: true, newDeadline: true } },
      },
    });

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
    const result = batches.map(b => ({ ...b, stats: statsMap.get(b.id) || null }));
    
    res.json(result);
  } catch (error) { next(error); }
}

export async function updateBatch(req, res, next) {
  try {
    const { id } = req.params;
    const { submissionDeadline } = req.body;
    const batch = await prisma.uploadBatch.update({
      where: { id: parseInt(id) },
      data: { submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null },
    });
    await createAuditLog({
      userId: req.user.id, action: 'UPDATE_BATCH_DEADLINE',
      entityType: 'UPLOAD_BATCH', entityId: batch.id,
      metadata: { submissionDeadline },
    });
    res.json(batch);
  } catch (error) { next(error); }
}

export async function grantStoreExtension(req, res, next) {
  try {
    const { batchId, storeId, newDeadline, note } = req.body;
    if (!batchId || !storeId || !newDeadline) throw new AppError('batchId, storeId, newDeadline required', 400);
    const ext = await prisma.batchDeadlineExtension.upsert({
      where: { batchId_storeId: { batchId: parseInt(batchId), storeId: parseInt(storeId) } },
      update: { newDeadline: new Date(newDeadline), grantedBy: req.user.id, grantedAt: new Date(), note: note || null },
      create: { batchId: parseInt(batchId), storeId: parseInt(storeId), newDeadline: new Date(newDeadline), grantedBy: req.user.id, note: note || null },
    });
    await createAuditLog({
      userId: req.user.id, action: 'GRANT_STORE_EXTENSION',
      entityType: 'UPLOAD_BATCH', entityId: parseInt(batchId),
      metadata: { storeId, newDeadline, note },
    });
    res.json(ext);
  } catch (error) { next(error); }
}

export async function getTrends(req, res, next) {
  try {
    const { cycles = 6 } = req.query;
    const batches = (await prisma.uploadBatch.findMany({
      orderBy: { inventoryDate: 'desc' },
      take: parseInt(cycles),
      select: { id: true, inventoryDate: true },
    })).reverse(); // most-recent N, oldest-first for chart left-to-right ordering
    if (batches.length === 0) return res.json({ batches: [], series: [] });

    const batchIds = batches.map(b => b.id);
    const rows = await prisma.$queryRaw`
      SELECT
        ir."batchId",
        ir."storeId",
        s."storeName",
        COUNT(*)::int AS "totalItems",
        COUNT(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN 1 END)::int AS "shortageCount",
        SUM(CASE WHEN ir.difference < 0 AND ir.status='SUBMITTED' THEN ABS(ir.difference) ELSE 0 END)::float AS "totalUnitsLost"
      FROM "InventoryRecord" ir
      JOIN "Store" s ON s.id = ir."storeId"
      WHERE ir."batchId" = ANY(${batchIds})
      GROUP BY ir."batchId", ir."storeId", s."storeName"
    `;

    const storeMap = new Map();
    rows.forEach(r => {
      const sid = Number(r.storeId);
      if (!storeMap.has(sid)) storeMap.set(sid, { storeId: sid, storeName: r.storeName, data: [] });
      storeMap.get(sid).data.push({
        batchId: Number(r.batchId),
        totalItems: r.totalItems,
        shortageCount: r.shortageCount,
        shortageRate: r.totalItems > 0 ? Math.round((r.shortageCount / r.totalItems) * 1000) / 10 : 0,
        totalUnitsLost: Math.round(r.totalUnitsLost * 10) / 10,
      });
    });

    
    res.json({ batches: batches.map(b => ({ id: b.id, inventoryDate: b.inventoryDate })), series: Array.from(storeMap.values()) });
  } catch (error) { next(error); }
}

export async function getStoreDrilldown(req, res, next) {
  try {
    const { storeId } = req.params;
    const { batchId } = req.query;

    let targetBatchId = batchId ? parseInt(batchId) : null;
    if (!targetBatchId) {
      const latest = await prisma.uploadBatch.findFirst({ orderBy: { inventoryDate: 'desc' }, select: { id: true } });
      if (!latest) return res.json([]);
      targetBatchId = latest.id;
    }

    const records = await prisma.inventoryRecord.findMany({
      where: { storeId: parseInt(storeId), batchId: targetBatchId, status: 'SUBMITTED', difference: { lt: 0 } },
      orderBy: { difference: 'asc' },
      select: { id: true, materialCode: true, materialName: true, systemQuantity: true, physicalQuantity: true, difference: true, remarks: true, shrinkageCategory: true },
    });
    res.json(records);
  } catch (error) { next(error); }
}

export async function getBatchExport(req, res, next) {
  try {
    const { batchId } = req.params;
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: parseInt(batchId) },
      select: { inventoryDate: true, originalFileName: true },
    });
    if (!batch) throw new AppError('Batch not found', 404);

    const records = await prisma.inventoryRecord.findMany({
      where: { batchId: parseInt(batchId) },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: { select: { storeCode: true, storeName: true } },
        submitter: { select: { name: true, employeeId: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Batch Export');
    ws.columns = [
      { header: 'Store Code',    key: 'storeCode',    width: 12 },
      { header: 'Store Name',    key: 'storeName',    width: 22 },
      { header: 'Material Name', key: 'materialCode', width: 20 },
      { header: 'Description',   key: 'materialName', width: 32 },
      { header: 'System Stock',   key: 'sys',          width: 14 },
      { header: 'Physical Stock',key: 'sold',         width: 14 },
      { header: 'Diff',          key: 'diff',         width: 10 },
      { header: 'Category',      key: 'category',     width: 18 },
      { header: 'Remarks',       key: 'remarks',      width: 30 },
      { header: 'Status',        key: 'status',       width: 12 },
      { header: 'Submitted By',  key: 'submittedBy',  width: 20 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };

    records.forEach(r => ws.addRow({
      storeCode: r.store.storeCode, storeName: r.store.storeName,
      materialCode: r.materialCode, materialName: r.materialName,
      sys: r.systemQuantity, sold: r.physicalQuantity ?? '',
      diff: r.difference ?? '', category: r.shrinkageCategory || '',
      remarks: r.remarks || '', status: r.status,
      submittedBy: r.submitter ? `${r.submitter.name} (${r.submitter.employeeId})` : '',
    }));

    await createAuditLog({ userId: req.user.id, action: 'DOWNLOAD_BATCH_EXPORT', entityType: 'UPLOAD_BATCH', entityId: parseInt(batchId), metadata: { recordCount: records.length } });

    const dateStr = batch.inventoryDate.toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_Batch_${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
}

// """ Excel sample template """"""""""""""""""""""""""""""""""""""""""""""""""""

export async function downloadSampleTemplate(req, res, next) {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Inventory');

    ws.columns = [
      { header: 'Plant',             key: 'plant',    width: 14 },
      { header: 'Material',          key: 'material', width: 18 },
      { header: 'Material Description', key: 'desc',  width: 32 },
      { header: 'System  Stock',     key: 'stock',    width: 16 },
      { header: 'Remarks',           key: 'remarks',  width: 30 },
    ];

    // Style header row
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    hRow.height = 20;

    // Freeze and filter
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

    // Sample rows
    const samples = [
      { plant: '2050', material: 'MAT001', desc: 'Mineral Water 1.5L',     stock: 120, remarks: '' },
      { plant: '2050', material: 'MAT002', desc: 'Rice 5kg Bag',            stock: 80,  remarks: '' },
      { plant: '2050', material: 'MAT003', desc: 'Cooking Oil 1L',          stock: 45,  remarks: '' },
      { plant: '2051', material: 'MAT001', desc: 'Mineral Water 1.5L',     stock: 95,  remarks: '' },
      { plant: '2051', material: 'MAT004', desc: 'Sugar 1kg',               stock: 200, remarks: '' },
    ];

    samples.forEach(row => ws.addRow(row));

    // Format Plant and Material as text to preserve leading zeros
    ws.getColumn('plant').numFmt    = '@';
    ws.getColumn('material').numFmt = '@';

    // Instructions sheet
    const info = workbook.addWorksheet('Instructions');
    info.getColumn(1).width = 70;
    const lines = [
      'KinMarche -- Inventory Upload Template',
      '',
      'REQUIRED COLUMNS (exact header names or accepted aliases):',
      '  - Plant / Store Code / StoreCode  -> Store Code from your store list',
      '  - Material / Material Code / SKU  -> Item identifier',
      '  - Material Description / Description  -> Item name',
      '  - System  Stock / System Stock / SYS  -> Stock quantity per your ERP system',
      '',
      'OPTIONAL COLUMNS:',
      '  - Remarks / Remark / Note  -> Pre-filled remarks (managers can edit)',
      '',
      'NOTES:',
      '  - Each store code in this file will be matched against your store list.',
      '  - If a store code does not exist it will be automatically created',
      '    with the name "Store {code}" -- rename it afterwards in Store Management.',
      '  - Store codes are case-sensitive.',
      '  - Maximum file size: 10 MB.',
      '  - Supported formats: .xlsx, .xls, .csv',
    ];
    lines.forEach((line, i) => {
      const cell = info.getCell(`A${i + 1}`);
      cell.value = line;
      if (i === 0) cell.font = { bold: true, size: 13 };
      if (line.startsWith('REQUIRED') || line.startsWith('OPTIONAL') || line.startsWith('NOTES')) {
        cell.font = { bold: true };
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="KinGuard_InventoryTemplate.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
}

// """ User deletion """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export async function deleteUser(req, res, next) {
  try {
    const userId = parseInt(req.params.id);

    if (userId === req.user.id) {
      throw new AppError('You cannot delete your own account', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new AppError('Cannot delete the last administrator account', 400);
      }
    }

    // Reassign non-nullable FK references to the deleting admin so data isn't orphaned
    await prisma.uploadBatch.updateMany({ where: { uploadedBy: userId }, data: { uploadedBy: req.user.id } });
    await prisma.batchDeadlineExtension.updateMany({ where: { grantedBy: userId }, data: { grantedBy: req.user.id } });

    // Null out nullable FK references
    await prisma.inventoryRecord.updateMany({ where: { submittedBy: userId }, data: { submittedBy: null } });
    await prisma.auditLog.updateMany({ where: { userId }, data: { userId: null } });

    await prisma.user.delete({ where: { id: userId } });

    await createAuditLog({
      userId: req.user.id, action: 'DELETE_USER',
      entityType: 'USER', entityId: userId,
      metadata: { employeeId: user.employeeId, name: user.name, role: user.role },
    });

    res.json({ message: 'User deleted' });
  } catch (error) { next(error); }
}

// """ Bulk store delete """"""""""""""""""""""""""""""""""""""""""""""""""""""""

export async function bulkDeleteStores(req, res, next) {
  try {
    const { ids, force = false } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError('ids must be a non-empty array', 400);
    }

    const storeIds = ids.map(Number);

    if (force) {
      await prisma.batchDeadlineExtension.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.inventoryRecord.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.user.updateMany({ where: { storeId: { in: storeIds } }, data: { storeId: null } });
      await prisma.store.deleteMany({ where: { id: { in: storeIds } } });

      await createAuditLog({
        userId: req.user.id, action: 'BULK_DELETE_STORES',
        entityType: 'STORE', entityId: null,
        metadata: { ids: storeIds, force: true, count: storeIds.length },
      });

      sInvalidate('admin:dashboard');
      return res.json({ deleted: storeIds.length, message: `${storeIds.length} store(s) permanently deleted` });
    }

    // Non-force: only delete stores with no inventory records
    const withRecords = await prisma.inventoryRecord.findMany({
      where: { storeId: { in: storeIds } },
      select: { storeId: true },
      distinct: ['storeId'],
    });
    const blockedIds  = new Set(withRecords.map(r => r.storeId));
    const deletableIds = storeIds.filter(id => !blockedIds.has(id));

    if (deletableIds.length > 0) {
      await prisma.batchDeadlineExtension.deleteMany({ where: { storeId: { in: deletableIds } } });
      await prisma.user.updateMany({ where: { storeId: { in: deletableIds } }, data: { storeId: null } });
      await prisma.store.deleteMany({ where: { id: { in: deletableIds } } });
    }

    await createAuditLog({
      userId: req.user.id, action: 'BULK_DELETE_STORES',
      entityType: 'STORE', entityId: null,
      metadata: { ids: storeIds, force: false, deleted: deletableIds.length, blocked: blockedIds.size },
    });

    sInvalidate('admin:dashboard');
    res.json({
      deleted: deletableIds.length,
      blocked: blockedIds.size,
      message: blockedIds.size > 0
        ? `Deleted ${deletableIds.length} store(s). ${blockedIds.size} skipped (have records " use force delete).`
        : `${deletableIds.length} store(s) deleted`,
    });
  } catch (error) { next(error); }
}

// """ Store force-delete (cascade all data) """"""""""""""""""""""""""""""""""""

export async function forceDeleteStore(req, res, next) {
  try {
    const storeId = parseInt(req.params.id);

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new AppError('Store not found', 404);

    await prisma.batchDeadlineExtension.deleteMany({ where: { storeId } });
    await prisma.inventoryRecord.deleteMany({ where: { storeId } });
    await prisma.user.updateMany({ where: { storeId }, data: { storeId: null } });
    await prisma.store.delete({ where: { id: storeId } });

    await createAuditLog({
      userId: req.user.id, action: 'FORCE_DELETE_STORE',
      entityType: 'STORE', entityId: storeId,
      metadata: { storeCode: store.storeCode, storeName: store.storeName },
    });

    sInvalidate('admin:dashboard');
    res.json({ message: 'Store and all its data permanently deleted' });
  } catch (error) { next(error); }
}

// """ Batch (cycle) deletion """""""""""""""""""""""""""""""""""""""""""""""""""

export async function deleteBatch(req, res, next) {
  try {
    const batchId = parseInt(req.params.id);

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      select: { id: true, inventoryDate: true, originalFileName: true },
    });
    if (!batch) throw new AppError('Cycle not found', 404);

    await prisma.batchDeadlineExtension.deleteMany({ where: { batchId } });
    await prisma.inventoryRecord.deleteMany({ where: { batchId } });
    await prisma.uploadBatch.delete({ where: { id: batchId } });

    await createAuditLog({
      userId: req.user.id, action: 'DELETE_BATCH',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { inventoryDate: batch.inventoryDate, fileName: batch.originalFileName },
    });

    sInvalidate('admin:dashboard');
    res.json({ message: 'Cycle deleted' });
  } catch (error) { next(error); }
}

// """ Unlock a store's submission so they can re-count """""""""""""""""""""""""

export async function unlockStoreForBatch(req, res, next) {
  try {
    const batchId = parseInt(req.params.id);
    const { storeId } = req.body;
    if (!storeId) throw new AppError('storeId is required', 400);

    const result = await prisma.inventoryRecord.updateMany({
      where: { batchId, storeId: parseInt(storeId), status: 'SUBMITTED' },
      data: {
        status: 'PENDING',
        physicalQuantity: null,
        difference: null,
        submittedBy: null,
        submittedAt: null,
      },
    });

    await createAuditLog({
      userId: req.user.id, action: 'UNLOCK_STORE_SUBMISSION',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { storeId, recordsUnlocked: result.count },
    });

    sInvalidate('admin:dashboard');
    res.json({ message: `${result.count} record(s) reset to pending`, count: result.count });
  } catch (error) { next(error); }
}

// """ Admin override of any inventory record """""""""""""""""""""""""""""""""""

export async function overrideInventoryRecord(req, res, next) {
  try {
    const recordId = parseInt(req.params.id);
    const { physicalQuantity, remarks, shrinkageCategory, status } = req.body;

    const record = await prisma.inventoryRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new AppError('Record not found', 404);

    const updateData = {};

    if (physicalQuantity !== undefined) {
      const qty = physicalQuantity !== null && physicalQuantity !== '' ? parseFloat(physicalQuantity) : null;
      if (qty !== null && isNaN(qty)) throw new AppError('Invalid quantity', 400);
      updateData.physicalQuantity = qty;
      updateData.difference = qty !== null ? parseFloat((qty - record.systemQuantity).toFixed(4)) : null;
    }

    if (remarks !== undefined) updateData.remarks = remarks || null;
    if (shrinkageCategory !== undefined) updateData.shrinkageCategory = shrinkageCategory || null;
    if (status !== undefined) {
      if (!['PENDING', 'SUBMITTED'].includes(status)) throw new AppError('Invalid status', 400);
      updateData.status = status;
      if (status === 'SUBMITTED') {
        updateData.submittedBy = req.user.id;
        updateData.submittedAt = new Date();
      } else {
        updateData.submittedBy = null;
        updateData.submittedAt = null;
      }
    }

    const updated = await prisma.inventoryRecord.update({
      where: { id: recordId },
      data: updateData,
      include: { store: { select: { storeCode: true, storeName: true } } },
    });

    await createAuditLog({
      userId: req.user.id, action: 'OVERRIDE_RECORD',
      entityType: 'INVENTORY_RECORD', entityId: recordId,
      metadata: {
        before: {
          physicalQuantity: record.physicalQuantity,
          difference: record.difference,
          remarks: record.remarks,
          status: record.status,
        },
        after: updateData,
      },
    });

    sInvalidate('admin:dashboard');
    res.json(updated);
  } catch (error) { next(error); }
}

// """ Export audit log to Excel """"""""""""""""""""""""""""""""""""""""""""""""

export async function exportAuditLogs(req, res, next) {
  try {
    const { action, limit = 2000 } = req.query;
    const where = action ? { action } : {};

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
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
      empId:      log.user?.employeeId || '--',
      name:       log.user?.name || 'System',
      action:     log.action,
      entityType: log.entityType || '',
      entityId:   log.entityId ?? '',
      metadata:   log.metadata ? JSON.stringify(log.metadata) : '',
    }));

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_ActivityLog_${date}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
}

// -- PDF Exports --

export async function downloadInventoryExportPDF(req, res, next) {
  try {
    const { storeId, status, batchId, discrepancy, search } = req.query;
    const where = {};
    if (storeId)     where.storeId  = parseInt(storeId);
    if (status)      where.status   = status;
    if (batchId)     where.batchId  = parseInt(batchId);
    if (search)      where.OR = [
      { materialCode: { contains: search, mode: 'insensitive' } },
      { materialName: { contains: search, mode: 'insensitive' } },
    ];
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const records = await prisma.inventoryRecord.findMany({
      where,
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: { select: { storeCode: true, storeName: true } },
        batch: { select: { inventoryDate: true } },
      },
    });

    const { buildPDF, baseDocDef, tableLayout, inventoryTableRows } = await import('../services/pdfService.js');
    const today = new Date().toISOString().split('T')[0];

    const pdfBuffer = await buildPDF({
      ...baseDocDef({ title: 'Inventory Submissions', subtitle: `${records.length} records - ${today}` }),
      content: [{
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Store', style: 'th' },
              { text: 'Material', style: 'th' },
              { text: 'Description', style: 'th' },
              { text: 'Date', style: 'th' },
              { text: 'SYS', style: 'th', alignment: 'right' },
              { text: 'Sold', style: 'th', alignment: 'right' },
              { text: 'Variance', style: 'th', alignment: 'right' },
              { text: 'Status', style: 'th' },
            ],
            ...inventoryTableRows(records),
          ],
        },
        layout: tableLayout(),
      }],
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
    const { storeId, status, discrepancy } = req.query;
    const where = {};
    if (storeId)  where.storeId = parseInt(storeId);
    if (status)   where.status  = status;
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const records = await prisma.inventoryRecord.findMany({
      where,
      include: {
        store: { select: { storeCode: true, storeName: true } },
        batch: { select: { inventoryDate: true } },
      },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
    });

    const { buildPDF, baseDocDef, tableLayout, inventoryTableRows } = await import('../services/pdfService.js');
    const today = new Date().toISOString().split('T')[0];

    const pdfBuffer = await buildPDF({
      ...baseDocDef({ title: 'Reconciliation Report', subtitle: `${records.length} records - ${today}` }),
      content: [{
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Store',       style: 'th' },
              { text: 'Material',    style: 'th' },
              { text: 'Description', style: 'th' },
              { text: 'Date',        style: 'th' },
              { text: 'SYS',         style: 'th', alignment: 'right' },
              { text: 'Sold',        style: 'th', alignment: 'right' },
              { text: 'Variance',    style: 'th', alignment: 'right' },
              { text: 'Status',      style: 'th' },
            ],
            ...inventoryTableRows(records),
          ],
        },
        layout: tableLayout(),
      }],
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

export async function sendBatchReminders(req, res, next) {
  try {
    const batchId = parseInt(req.params.id);
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });
    if (!batch) throw new AppError('Batch not found', 404);

    const pendingRecords = await prisma.inventoryRecord.findMany({
      where: { batchId, status: 'PENDING' },
      select: { storeId: true },
      distinct: ['storeId'],
    });

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

    const deadline = batch.submissionDeadline ?? new Date(Date.now() + 24 * 3_600_000);
    const { sendDeadlineReminderEmail } = await import('../services/emailService.js');
    await sendDeadlineReminderEmail({ managers, inventoryDate: batch.inventoryDate, deadline });

    await createAuditLog({
      userId: req.user.id, action: 'SEND_BATCH_REMINDERS',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { managerCount: managers.length, pendingStores: storeIds.length },
    });

    res.json({
      sent: managers.length,
      pending: storeIds.length,
      message: managers.length > 0
        ? `Email reminder sent to ${managers.length} store manager(s) (${storeIds.length} store(s) pending).`
        : `${storeIds.length} store(s) still pending but no email addresses on file. Add emails in User Management.`,
    });
  } catch (error) { next(error); }
}

export async function downloadBatchExportPDF(req, res, next) {
  try {
    const { batchId } = req.params;
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: parseInt(batchId) },
      select: { inventoryDate: true },
    });
    if (!batch) throw new AppError('Batch not found', 404);

    const records = await prisma.inventoryRecord.findMany({
      where: { batchId: parseInt(batchId) },
      orderBy: [{ storeId: 'asc' }, { materialCode: 'asc' }],
      include: {
        store: { select: { storeCode: true, storeName: true } },
        batch: { select: { inventoryDate: true } },
      },
    });

    const { buildPDF, baseDocDef, tableLayout, inventoryTableRows } = await import('../services/pdfService.js');
    const dateStr = batch.inventoryDate.toISOString().split('T')[0];

    const pdfBuffer = await buildPDF({
      ...baseDocDef({ title: 'Cycle Export', subtitle: `Date: ${dateStr} - ${records.length} records` }),
      content: [{
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Store', style: 'th' },
              { text: 'Material', style: 'th' },
              { text: 'Description', style: 'th' },
              { text: 'Date', style: 'th' },
              { text: 'SYS', style: 'th', alignment: 'right' },
              { text: 'Sold', style: 'th', alignment: 'right' },
              { text: 'Variance', style: 'th', alignment: 'right' },
              { text: 'Status', style: 'th' },
            ],
            ...inventoryTableRows(records),
          ],
        },
        layout: tableLayout(),
      }],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="KinGuard_Cycle_${dateStr}.pdf"`);
    res.end(pdfBuffer);
  } catch (error) { next(error); }
}
