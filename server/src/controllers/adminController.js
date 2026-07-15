import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import prisma from '../config/prisma.js';
import { sGet, sSet, sInvalidate } from '../services/serverCache.js';
import { parseId, requireId, parsePage, parsePageSize, parseIntParam } from '../utils/params.js';
import { invalidateUserCache } from '../middleware/auth.js';
import { validatePassword } from '../controllers/authController.js';

// Hard cap on rows returned by report/export endpoints.
const EXPORT_ROW_LIMIT = 10_000;

// Generate a secure random temp password that satisfies validatePassword() rules.
// Uses only unambiguous characters (no I/l/0/O) so it's easy to communicate.
function generateTempPassword() {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const all     = upper + lower + digits;
  const bytes   = randomBytes(16); // loop below reads up to bytes[10]; extra bytes feed the shuffle
  // Guarantee at least one of each required class + a special char
  let pw = [
    upper[bytes[0]  % upper.length],
    lower[bytes[1]  % lower.length],
    digits[bytes[2] % digits.length],
    '!',
  ];
  for (let i = 3; i < 8; i++) pw.push(all[bytes[3 + i] % all.length]);
  // Fisher-Yates shuffle so requirements aren't always at the front
  for (let i = pw.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

// Supabase / PgBouncer drops idle connections after ~5 min.
// This wrapper retries the first DB call once after a forced reconnect,
// covering cold-start failures on upload and batch-list endpoints.
async function withDbRetry(fn) {
  try {
    return await fn();
  } catch (firstErr) {
    console.warn('[db-retry] First query failed, reconnecting:', firstErr.message);
    try {
      await new Promise(r => setTimeout(r, 400));
      await prisma.$connect();
      return await fn();
    } catch (retryErr) {
      console.error('[db-retry] Retry also failed:', retryErr.message);
      throw new AppError('Unable to reach the database. Please wait a moment and try again.', 503);
    }
  }
}

/** Validate and parse a date string from user input. Throws 400 on invalid format. */
function parseUserDate(value, fieldName) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new AppError(`Invalid ${fieldName} — expected a valid ISO date string`, 400);
  return d;
}

// Shared column name aliases for Excel/CSV parsing
const COLUMN_MAP = {
  storeCode:      ['Plant', 'Plant Code', 'Store Code', 'Store code', 'StoreCode', 'Store', 'store_code', 'STORE CODE', 'PLANT', 'PLANT CODE'],
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
    if (cached) return res.json(cached);

    const [totalStores, latestBatch] = await Promise.all([
      prisma.store.count({ where: { isActive: true } }),
      prisma.uploadBatch.findFirst({
        where: { status: 'COMPLETED' },
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

    // Round 2 — all stat queries + last-4-batches in one parallel burst
    // (moved last4Batches here so hotspot SQL can run in round 3, not round 4)
    const [perStoreStats, networkStats, allStores, last4Batches] = await Promise.all([
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
      prisma.uploadBatch.findMany({ orderBy: { inventoryDate: 'desc' }, take: 4, select: { id: true } }),
    ]);

    const batchIds = last4Batches.map((b) => b.id);

    // Round 3 — top remarks + hotspot detection run in parallel
    // Hotspot: single GROUP BY SQL instead of loading all shortage rows into Node memory
    const [topRemarkRows, hotspotRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT "storeId", remarks, COUNT(*)::int AS cnt
        FROM "InventoryRecord"
        WHERE "batchId" = ${latestBatch.id} AND status = 'SUBMITTED' AND remarks IS NOT NULL AND remarks <> ''
        GROUP BY "storeId", remarks
        ORDER BY "storeId", cnt DESC
      `,
      batchIds.length >= 2
        ? prisma.$queryRaw`
            SELECT
              ir."storeId",
              s."storeCode",
              s."storeName",
              ir."materialCode",
              ir."materialName",
              COUNT(DISTINCT ir."batchId")::int                             AS "batchCount",
              ROUND(SUM(ABS(ir.difference))::numeric, 1)::float             AS "totalShortage"
            FROM "InventoryRecord" ir
            JOIN "Store" s ON s.id = ir."storeId"
            WHERE ir."batchId" = ANY(${batchIds})
              AND ir.status = 'SUBMITTED'
              AND ir.difference < 0
            GROUP BY ir."storeId", s."storeCode", s."storeName", ir."materialCode", ir."materialName"
            HAVING COUNT(DISTINCT ir."batchId") >= 2
            ORDER BY "batchCount" DESC, "totalShortage" DESC
            LIMIT 5
          `
        : Promise.resolve([]),
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

    // Map SQL hotspot results (already sorted + limited to 5 by the query)
    const hotspots = hotspotRows.map((r) => ({
      storeCode:      r.storeCode,
      storeName:      r.storeName,
      materialCode:   r.materialCode,
      materialName:   r.materialName,
      batchCount:     Number(r.batchCount),
      totalShortage:  Number(r.totalShortage),
      dominantRemark: null, // omitted from SQL for performance; available on drilldown
    }));

    const net = networkStats[0] || {};
    const storesPending = storeScorecard.filter((s) => s.status === 'PENDING').length;
    const storesSubmitted = storeScorecard.filter((s) => s.status === 'SUBMITTED').length;
    const overdueStores = storeScorecard.filter((s) => s.isOverdue).map((s) => s.storeName);

    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] GET_ADMIN_DASHBOARD: ${duration}ms`);

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
    sSet('admin:dashboard', result, 300_000); // 5-minute cache
    
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
      throw new AppError('Plant code and name are required', 400);
    }

    const normalizedCode = storeCode.toString().trim();
    if (!normalizedCode) throw new AppError('Plant code cannot be blank', 400);
    if (normalizedCode.length > 50) throw new AppError('Plant code must be 50 characters or fewer', 400);

    const normalizedName = storeName?.toString().trim();
    if (!normalizedName) throw new AppError('Plant name cannot be blank', 400);

    const store = await prisma.store.create({
      data: {
        storeCode: normalizedCode,
        storeName: normalizedName,
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
      next(new AppError('Plant code already exists', 409));
    } else {
      next(error);
    }
  }
}

export async function deleteStore(req, res, next) {
  try {
    const storeId = requireId(req.params.id, 'storeId');

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

    // Remove dependent records in one atomic transaction to avoid race conditions
    await prisma.$transaction(async (tx) => {
      await tx.batchDeadlineExtension.deleteMany({ where: { storeId } });
      if (store._count.users > 0) {
        await tx.user.updateMany({ where: { storeId }, data: { storeId: null } });
      }
      await tx.store.delete({ where: { id: storeId } });
    });

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
    const storeId = requireId(req.params.id, 'storeId');
    const { storeName, isActive } = req.body;

    const store = await prisma.store.update({
      where: { id: storeId },
      data: {
        storeName: storeName !== undefined ? storeName : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    }).catch(err => {
      if (err.code === 'P2025') throw new AppError('Store not found', 404);
      throw err;
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
      select: {
        id: true,
        employeeId: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
        pendingApproval: true,
        source: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        store: {
          select: { id: true, storeCode: true, storeName: true },
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

    if ((role === 'ADMIN' || role === 'AREA_MANAGER') && storeId) {
      throw new AppError('Admins and Area Managers cannot be assigned to a store', 400);
    }

    validatePassword(password);

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        employeeId,
        name,
        passwordHash,
        role,
        storeId: storeId ? requireId(storeId, 'storeId') : null,
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
    const userId = requireId(req.params.id, 'userId');
    const { name, password, storeId, isActive, email, phone } = req.body;

    // Fetch current user to check role and current state
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, storeId: true, role: true, pendingApproval: true, isActive: true },
    });
    if (!currentUser) throw new AppError('User not found', 404);

    const data = {
      name:     name     !== undefined ? name     : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
      email:    email    !== undefined ? (email || null)  : undefined,
      phone:    phone    !== undefined ? (phone || null)  : undefined,
    };

    // Handle store assignment
    if (storeId !== undefined) {
      const parsedStoreId = storeId ? requireId(storeId, 'storeId') : null;
      if (parsedStoreId && (currentUser.role === 'ADMIN' || currentUser.role === 'AREA_MANAGER')) {
        throw new AppError('Admins and Area Managers cannot be assigned to a store', 400);
      }
      if (parsedStoreId) {
        data.store = { connect: { id: parsedStoreId } };
      } else if (currentUser.storeId) {
        data.store = { disconnect: true };
      }
    }

    // Handle password update
    if (password) {
      validatePassword(password);
      data.passwordHash = await bcrypt.hash(password, 10);
      data.mustChangePassword = false; // Admin resetting password clears the force-change flag
    }

    // Prevent editing users in pending approval state - they should be approved/rejected instead
    if (currentUser.pendingApproval) {
      throw new AppError('Cannot edit users in pending approval state. Please approve or reject first.', 400);
    }

    const user = await prisma.user.update({
      where: { id: userId },
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

    invalidateUserCache(userId);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('email') ? 'Email address' : 'Employee ID';
      return next(new AppError(`${field} is already in use by another account`, 409));
    }
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

    const targetDate     = parseUserDate(inventoryDate, 'inventoryDate');
    const parsedDeadline = parseUserDate(submissionDeadline, 'submissionDeadline');
    const windowStart = new Date(targetDate); windowStart.setDate(windowStart.getDate() - 3);
    const windowEnd   = new Date(targetDate); windowEnd.setDate(windowEnd.getDate() + 3);
    const existingBatch = await withDbRetry(() => prisma.uploadBatch.findFirst({
      where: { inventoryDate: { gte: windowStart, lte: windowEnd } },
      select: { id: true, inventoryDate: true, originalFileName: true },
    }));
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


    // Create upload batch
    const batch = await prisma.uploadBatch.create({
      data: {
        originalFileName: file.originalname,
        uploadedBy: req.user.id,
        inventoryDate: targetDate,
        submissionDeadline: parsedDeadline,
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
    let existingStores;
    try {
      existingStores = await prisma.store.findMany({ select: { id: true, storeCode: true } });
    } catch {
      await prisma.$connect();
      existingStores = await prisma.store.findMany({ select: { id: true, storeCode: true } });
    }
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

    // Auto-create inactive placeholder users for every newly created store.
    // Accounts are inactive until an admin approves them in User Management.
    // A fresh password is generated at approval time, not here.
    const autoCreatedUsers = [];
    if (newStoreCodes.length > 0) {
      const placeholder = await bcrypt.hash(randomBytes(16).toString('hex'), 10);
      
      // Build list of users to create
      const usersToCreate = [];
      for (const code of newStoreCodes) {
        const storeId = storeMap.get(code);
        if (!storeId) continue;
        const employeeId = `MGR${code}`;
        usersToCreate.push({
          employeeId,
          name: `Manager ${code}`,
          passwordHash: placeholder,
          role: 'STORE_MANAGER',
          storeId,
          isActive: false,
          pendingApproval: true,
          source: 'AUTO_STORE',
        });
        autoCreatedUsers.push({ employeeId, storeCode: code });
      }
      
      // Batch create all users at once (much faster!)
      if (usersToCreate.length > 0) {
        await prisma.user.createMany({
          data: usersToCreate,
          skipDuplicates: true, // Skip if employeeId already exists
        });
      }
    }

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
          errors.push({ row: rowNum, error: 'Missing Plant Code' });
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

    // If every row failed, delete the orphan batch and surface a clean error
    if (successfulRecords.length === 0) {
      await prisma.uploadBatch.delete({ where: { id: batch.id } });
      return res.status(422).json({
        error: 'No valid rows found — batch rejected. Check your file format.',
        errors: errors.slice(0, 20),
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

    sInvalidate('admin:batches');

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

    // Respond immediately — don't block the upload on email delivery
    res.status(201).json({
      batchId: batch.id,
      totalRows: rows.length,
      successfulRows: successfulRecords.length,
      rejectedRows: errors.length,
      errors: errors.slice(0, 50),
      autoCreatedUsers: autoCreatedUsers.length > 0 ? autoCreatedUsers : undefined,
    });

    // Send emails to store managers (bell notification only — no email per new design)
    // Send emails to area managers (they get email on new cycle)
    Promise.all([
      prisma.user.findMany({
        where: { role: 'AREA_MANAGER', isActive: true, pendingApproval: false, email: { not: null } },
        select: { id: true, name: true, email: true, managedStores: { select: { id: true } } },
      }),
    ]).then(async ([areaManagers]) => {
      if (!areaManagers.length) return;
      const { sendNewCycleEmailAM } = await import('../services/emailService.js');
      const amWithCount = areaManagers.map(am => ({ ...am, storeCount: am.managedStores.length }));
      sendNewCycleEmailAM({ managers: amWithCount, inventoryDate, deadline: submissionDeadline || null })
        .then(r => console.warn(`[upload] AM email result: sent=${r.sent}, failed=${r.failed}`))
        .catch(e => console.error('[upload] AM email send error:', e.message));
    }).catch(e => console.error('[upload] AM query failed:', e.message));
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

    // Fetch all plant codes for validation — retry once on cold-start connection failure
    const stores = await withDbRetry(() =>
      prisma.store.findMany({ select: { storeCode: true, storeName: true } })
    );

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
        errors.push('Missing Plant Code');
      } else if (!storeMap.has(storeCode)) {
        warnings.push(`New plant will be created: ${storeCode}`);
      }

      if (!materialCode) {
        errors.push('Missing Material Code');
      }

      // System quantity validation - Optional, defaults to 0 if empty
      // Store managers will fill the actual counted quantity later
      let systemQty = 0;
      if (rawQty !== null && rawQty !== undefined && rawQty !== '') {
        const qty = parseFloat(rawQty);
        if (isNaN(qty)) {
          errors.push('Invalid System Quantity (not a number)');
        } else if (qty < 0) {
          errors.push('Invalid System Quantity (negative)');
        } else {
          systemQty = qty;
        }
      }
      // If empty, systemQty stays 0 (no error, no warning)

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
        systemQuantity: systemQty,
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
    const { status, search, discrepancy } = req.query;
    const storeId     = parseId(req.query.storeId, 'storeId');
    const batchId     = parseId(req.query.batchId, 'batchId');
    const pageNum     = parsePage(req.query.page, 1);
    const pageSizeNum = parsePageSize(req.query.pageSize, 50, 200);

    const where = {};

    if (storeId)  where.storeId  = storeId;
    if (status)   where.status   = status;
    if (batchId)  where.batchId  = batchId;
    if (search) {
      where.OR = [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (discrepancy === 'shortage') where.difference = { lt: 0 };
    if (discrepancy === 'excess')   where.difference = { gt: 0 };
    if (discrepancy === 'matched')  where.difference = { equals: 0 };

    const skip = (pageNum - 1) * pageSizeNum;

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
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] GET_ADMIN_INVENTORY (${records.length} records, page ${pageNum}): ${duration}ms`);

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
    const { status, discrepancy, includeInactive } = req.query;
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');

    const where = {};

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
        `This filter matches ${count.toLocaleString()} records. Apply more specific filters (e.g. select a single cycle or store) to reduce to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer.`,
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

    const where = {};

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
        `This filter matches ${dlCount.toLocaleString()} records. Apply more specific filters to reduce to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer before downloading.`,
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

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reconciliation Report');

    // Add headers
    worksheet.columns = [
      { header: 'Plant Code', key: 'storeCode', width: 12 },
      { header: 'Plant Name', key: 'storeName', width: 20 },
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
    const { status, search, discrepancy } = req.query;
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');

    const where = {};

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
        `This filter matches ${exportCount.toLocaleString()} records. Apply more specific filters to reduce to ${EXPORT_ROW_LIMIT.toLocaleString()} or fewer before exporting.`,
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

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory Records');

    // Define columns with business-friendly names
    worksheet.columns = [
      { header: 'Plant Code', key: 'storeCode', width: 12 },
      { header: 'Plant Name', key: 'storeName', width: 25 },
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

    // Format Plant Code and Material Code as text to preserve leading zeros
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
    if (process.env.NODE_ENV !== 'production') console.log(`[PERF] DOWNLOAD_ADMIN_EXPORT (${records.length} records): ${duration}ms`);

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
    const { action } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

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

// """ C1: New batch management endpoints """""""""""""""""""""""""""""""""""""""

export async function getBatches(req, res, next) {
  try {
    const cached = sGet('admin:batches');
    if (cached) return res.json(cached);

    const batches = await withDbRetry(() => prisma.uploadBatch.findMany({
      orderBy: { inventoryDate: 'desc' },
      include: {
        uploader: { select: { name: true, employeeId: true } },
        _count: { select: { inventoryRecords: true } },
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
    const result = batches.map(b => ({ ...b, stats: statsMap.get(b.id) || null }));
    sSet('admin:batches', result, 60_000); // 1-minute cache
    res.json(result);
  } catch (error) { next(error); }
}

export async function updateBatch(req, res, next) {
  try {
    const batchId = requireId(req.params.id, 'batchId');
    const { submissionDeadline } = req.body;
    const parsedDeadline = parseUserDate(submissionDeadline, 'submissionDeadline');
    const batch = await prisma.uploadBatch.update({
      where: { id: batchId },
      data: { submissionDeadline: parsedDeadline },
    });
    await createAuditLog({
      userId: req.user.id, action: 'UPDATE_BATCH_DEADLINE',
      entityType: 'UPLOAD_BATCH', entityId: batch.id,
      metadata: { submissionDeadline },
    });
    sInvalidate('admin:batches');
    res.json(batch);
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
      prisma.uploadBatch.findUnique({ where: { id: batchId }, select: { id: true } }),
      prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }),
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
      metadata: { storeId, newDeadline, note },
    });
    res.json(ext);
  } catch (error) { next(error); }
}

export async function getTrends(req, res, next) {
  try {
    const cycles = parseIntParam(req.query.cycles, 'cycles', 6, 1, 24);
    const batches = (await prisma.uploadBatch.findMany({
      orderBy: { inventoryDate: 'desc' },
      take: cycles,
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
    const storeId = requireId(req.params.storeId, 'storeId');
    const batchIdParam = parseId(req.query.batchId, 'batchId');

    let targetBatchId = batchIdParam ?? null;
    if (!targetBatchId) {
      const latest = await prisma.uploadBatch.findFirst({ orderBy: { inventoryDate: 'desc' }, select: { id: true } });
      if (!latest) return res.json([]);
      targetBatchId = latest.id;
    }

    const records = await prisma.inventoryRecord.findMany({
      where: { storeId, batchId: targetBatchId, status: 'SUBMITTED', difference: { lt: 0 } },
      orderBy: { difference: 'asc' },
      select: { id: true, materialCode: true, materialName: true, systemQuantity: true, physicalQuantity: true, difference: true, remarks: true, shrinkageCategory: true },
    });
    res.json(records);
  } catch (error) { next(error); }
}

export async function getBatchExport(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
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

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Batch Export');
    ws.columns = [
      { header: 'Plant Code',    key: 'storeCode',    width: 12 },
      { header: 'Plant Name',    key: 'storeName',    width: 22 },
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

    await createAuditLog({ userId: req.user.id, action: 'DOWNLOAD_BATCH_EXPORT', entityType: 'UPLOAD_BATCH', entityId: batchId, metadata: { recordCount: records.length } });

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

    // Columns: Plant | Material | Material Description | System Stock | Physical Stock
    // System Stock and Physical Stock are left blank for store managers to fill in
    ws.columns = [
      { header: 'Plant',                key: 'plant',          width: 14 },
      { header: 'Material',             key: 'material',       width: 18 },
      { header: 'Material Description', key: 'desc',           width: 36 },
      { header: 'System  Stock',        key: 'systemStock',    width: 16 },
      { header: 'Physical Stock',       key: 'physicalStock',  width: 16 },
    ];

    // Style header row — red brand colour
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    hRow.height = 22;

    // Freeze and filter
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

    // Sample rows — System Stock and Physical Stock left blank (to be filled by managers)
    const samples = [
      { plant: '2003', material: '1000013986', desc: 'Whisky Black Label 750Ml', systemStock: null, physicalStock: null },
      { plant: '2001', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
      { plant: '2003', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
      { plant: '2004', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
      { plant: '2005', material: '1000017695', desc: 'Sardines Huile Vegetale Anny 125gr', systemStock: null, physicalStock: null },
    ];

    samples.forEach(row => ws.addRow(row));

    // Format Plant and Material as text to preserve leading zeros
    ws.getColumn('plant').numFmt    = '@';
    ws.getColumn('material').numFmt = '@';

    // Instructions sheet
    const info = workbook.addWorksheet('Instructions');
    info.getColumn(1).width = 75;
    const lines = [
      'KinMarche -- Inventory Upload Template',
      '',
      'HOW TO USE THIS TEMPLATE:',
      '  1. Fill in the Plant Code and Material columns for each item.',
      '  2. Leave System Stock and Physical Stock blank -- store managers fill these in.',
      '  3. Upload this file via the Upload page to create an inventory cycle.',
      '',
      'REQUIRED COLUMNS (accepted header names):',
      '  - Plant / Plant Code -> Your plant/store identifier',
      '  - Material / Material Code / SKU          -> Item code',
      '  - Material Description / Description      -> Item name',
      '',
      'COLUMNS FILLED BY STORE MANAGERS (leave blank in this file):',
      '  - System  Stock / System Stock -> Quantity per store ERP/records',
      '  - Physical Stock               -> Actual physical count',
      '',
      'NOTES:',
      '  - If a plant code in this file does not exist, it will be created automatically.',
      '  - Plant codes are matched exactly (case-sensitive).',
      '  - Maximum file size: 10 MB.',
      '  - Supported formats: .xlsx, .xls, .csv',
      '',
      'See the "Shrinkage Reference" sheet for all valid shrinkage categories and issue details.',
    ];
    lines.forEach((line, i) => {
      const cell = info.getCell(`A${i + 1}`);
      cell.value = line;
      if (i === 0) cell.font = { bold: true, size: 13 };
      if (line.startsWith('REQUIRED') || line.startsWith('OPTIONAL') || line.startsWith('NOTES') || line.startsWith('COLUMNS')) {
        cell.font = { bold: true };
      }
    });

    // Shrinkage Reference sheet — mirrors ISSUE_REASONS in the store UI
    const SHRINKAGE_CATEGORIES = {
      'Dented': [
        'Minor dent to packaging, product is ok',
        'Moderate dent to packaging, product with lesser impact',
        'Direct dent to product, product not ok',
        'Dented due to warehouse handling error',
        'Dented during transit/shipping',
      ],
      'Expiry': [
        'Product has passed the expiry date',
        'Product has passed the particular date',
        'Expired stock identified during stock take',
        'Expired stock designated for return to vendor',
        'Expired stock designated for disposal',
      ],
      'Damage': [
        'Physical breakage of product/component',
        'Physical scratches/abrasions on product/packaging',
        'Water exposure damage',
        'Fire/smoke exposure damage',
        'Electrical malfunction/damage',
        'Manufacturing defect identified',
        'Damage incurred during customer return process',
        'Unsaleable due to damage',
      ],
      'In Transit': [
        'Overage, Shortage, Damage (OS&D) report for transit damage',
        'Damage/issue due to cargo shift during transport',
        'Environmental exposure during transit (e.g., temperature, humidity)',
        'Pilferage suspected during transit',
        'Damage incurred due to transport accident',
        'Discrepancy between physical count and shipping documentation',
      ],
      'Other': [
        'Quality control hold, pending further inspection/decision',
        'Incorrect labeling identified on product/packaging',
        'Product subject to manufacturer recall',
        'Product deemed obsolete, no longer marketable',
        'Inventory adjustment due to system error/discrepancy',
        'Stock designated for donation',
        'Stock designated for sampling/testing',
        'Stock shared to national employees',
      ],
    };

    const ref = workbook.addWorksheet('Shrinkage Reference');
    ref.getColumn(1).width = 18;
    ref.getColumn(2).width = 62;

    // Header row
    const refHeader = ref.getRow(1);
    refHeader.values = ['Category', 'Issue Detail'];
    refHeader.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    refHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    refHeader.height = 20;
    ref.views = [{ state: 'frozen', ySplit: 1 }];

    const catColors = {
      'Dented':     'FFFFF3CD',
      'Expiry':     'FFFCE5CD',
      'Damage':     'FFFCD5D5',
      'In Transit': 'FFD5EAF5',
      'Other':      'FFE8E8E8',
    };

    let rowNum = 2;
    for (const [cat, reasons] of Object.entries(SHRINKAGE_CATEGORIES)) {
      const bgColor = catColors[cat] || 'FFFFFFFF';
      for (let i = 0; i < reasons.length; i++) {
        const row = ref.getRow(rowNum);
        row.values = [i === 0 ? cat : '', reasons[i]];
        row.getCell(1).font = { bold: i === 0, color: { argb: 'FF1E293B' } };
        row.getCell(2).font = { color: { argb: 'FF1E293B' } };
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        row.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
        row.getCell(2).border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
        rowNum++;
      }
      // Empty separator row between categories
      rowNum++;
    }

    // Note at the bottom
    const noteRow = ref.getRow(rowNum + 1);
    noteRow.getCell(1).value = 'Note:';
    noteRow.getCell(1).font = { bold: true, italic: true, color: { argb: 'FF64748B' } };
    ref.getRow(rowNum + 2).getCell(1).value = 'For "Other" category, store managers may also type a custom issue detail in the text field.';
    ref.getRow(rowNum + 2).getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
    ref.mergeCells(rowNum + 2, 1, rowNum + 2, 2);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="KinGuard_InventoryTemplate.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
}

// """ User deletion """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""

export async function deleteUser(req, res, next) {
  try {
    const userId = requireId(req.params.id, 'userId');

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

    // Wrap all FK reassignments + delete in a single transaction
    await prisma.$transaction(async (tx) => {
      // Reassign non-nullable FK references to the deleting admin so data isn't orphaned
      await tx.uploadBatch.updateMany({ where: { uploadedBy: userId }, data: { uploadedBy: req.user.id } });
      await tx.batchDeadlineExtension.updateMany({ where: { grantedBy: userId }, data: { grantedBy: req.user.id } });
      // Null out nullable FK references
      await tx.inventoryRecord.updateMany({ where: { submittedBy: userId }, data: { submittedBy: null } });
      await tx.auditLog.updateMany({ where: { userId }, data: { userId: null } });
      await tx.user.delete({ where: { id: userId } });
    });

    invalidateUserCache(userId);

    createAuditLog({
      userId: req.user.id, action: 'DELETE_USER',
      entityType: 'USER', entityId: userId,
      metadata: { employeeId: user.employeeId, name: user.name, role: user.role },
    }).catch(() => {});

    res.json({ message: 'User deleted' });
  } catch (error) {
    // P2025 = record not found (already deleted, concurrent request, etc.)
    if (error.code === 'P2025') {
      return next(new AppError('User not found or already deleted', 404));
    }
    next(error);
  }
}

// """ Bulk store delete """"""""""""""""""""""""""""""""""""""""""""""""""""""""

export async function bulkDeleteStores(req, res, next) {
  try {
    const { ids, force = false } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError('ids must be a non-empty array', 400);
    }

    const storeIds = ids.map((id, i) => requireId(id, `ids[${i}]`));

    if (force) {
      // Wrap cascade delete in a transaction — partial failure leaves DB consistent
      await prisma.$transaction(async (tx) => {
        await tx.batchDeadlineExtension.deleteMany({ where: { storeId: { in: storeIds } } });
        await tx.inventoryRecord.deleteMany({ where: { storeId: { in: storeIds } } });
        await tx.user.updateMany({ where: { storeId: { in: storeIds } }, data: { storeId: null } });
        await tx.store.deleteMany({ where: { id: { in: storeIds } } });
      });

      createAuditLog({
        userId: req.user.id, action: 'BULK_DELETE_STORES',
        entityType: 'STORE', entityId: null,
        metadata: { ids: storeIds, force: true, count: storeIds.length },
      }).catch(() => {});

      sInvalidate('admin:dashboard');
      return res.json({ deleted: storeIds.length, message: `${storeIds.length} store(s) permanently deleted` });
    }

    // Non-force: only delete stores with no inventory records
    const withRecords = await prisma.inventoryRecord.findMany({
      where: { storeId: { in: storeIds } },
      select: { storeId: true },
      distinct: ['storeId'],
    });
    const blockedIds   = new Set(withRecords.map(r => r.storeId));
    const deletableIds = storeIds.filter(id => !blockedIds.has(id));

    if (deletableIds.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.batchDeadlineExtension.deleteMany({ where: { storeId: { in: deletableIds } } });
        await tx.user.updateMany({ where: { storeId: { in: deletableIds } }, data: { storeId: null } });
        await tx.store.deleteMany({ where: { id: { in: deletableIds } } });
      });
    }

    createAuditLog({
      userId: req.user.id, action: 'BULK_DELETE_STORES',
      entityType: 'STORE', entityId: null,
      metadata: { ids: storeIds, force: false, deleted: deletableIds.length, blocked: blockedIds.size },
    }).catch(() => {});

    sInvalidate('admin:dashboard');
    res.json({
      deleted: deletableIds.length,
      blocked: blockedIds.size,
      message: blockedIds.size > 0
        ? `Deleted ${deletableIds.length} store(s). ${blockedIds.size} skipped (have records — use force delete).`
        : `${deletableIds.length} store(s) deleted`,
    });
  } catch (error) { next(error); }
}

// ── Store force-delete (cascade all data) ──────────────────────────────────────

export async function forceDeleteStore(req, res, next) {
  try {
    const storeId = requireId(req.params.id, 'storeId');

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new AppError('Store not found', 404);

    await prisma.$transaction(async (tx) => {
      await tx.batchDeadlineExtension.deleteMany({ where: { storeId } });
      await tx.inventoryRecord.deleteMany({ where: { storeId } });
      await tx.user.updateMany({ where: { storeId }, data: { storeId: null } });
      await tx.store.delete({ where: { id: storeId } });
    });

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
    const batchId = requireId(req.params.id, 'batchId');

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      select: { id: true, inventoryDate: true, originalFileName: true },
    });
    if (!batch) throw new AppError('Cycle not found', 404);

    await prisma.$transaction([
      prisma.batchDeadlineExtension.deleteMany({ where: { batchId } }),
      prisma.inventoryRecord.deleteMany({ where: { batchId } }),
      prisma.uploadBatch.delete({ where: { id: batchId } }),
    ]);

    await createAuditLog({
      userId: req.user.id, action: 'DELETE_BATCH',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { inventoryDate: batch.inventoryDate, fileName: batch.originalFileName },
    });

    sInvalidate('admin:dashboard', 'admin:batches');
    res.json({ message: 'Cycle deleted' });
  } catch (error) { next(error); }
}

// """ Unlock a store's submission so they can re-count """""""""""""""""""""""""

export async function unlockStoreForBatch(req, res, next) {
  try {
    const batchId = requireId(req.params.id, 'batchId');
    const storeId = requireId(req.body.storeId, 'storeId');

    const result = await prisma.inventoryRecord.updateMany({
      where: { batchId, storeId, status: 'SUBMITTED' },
      data: {
        status: 'PENDING',
        physicalQuantity: null,
        difference: null,
        shrinkageCategory: null,
        remarks: null,
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
    const recordId = requireId(req.params.id, 'recordId');
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
      if (status === 'SUBMITTED') {
        const finalPhysQty = updateData.physicalQuantity !== undefined
          ? updateData.physicalQuantity
          : record.physicalQuantity;
        if (finalPhysQty === null || finalPhysQty === undefined) {
          throw new AppError('Cannot mark as submitted without a physical stock quantity', 400);
        }
        updateData.submittedBy = req.user.id;
        updateData.submittedAt = new Date();
      } else {
        // Resetting to PENDING clears all count data so the store re-enters it
        updateData.physicalQuantity = null;
        updateData.difference       = null;
        updateData.submittedBy      = null;
        updateData.submittedAt      = null;
        updateData.shrinkageCategory = null;
      }
      updateData.status = status;
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
    const { action } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 2000, 5000);
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
    const { status, discrepancy, search } = req.query;
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');
    const where = {};
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
    const { status, discrepancy } = req.query;
    const storeId = parseId(req.query.storeId, 'storeId');
    const batchId = parseId(req.query.batchId, 'batchId');
    const where = {};
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
    const batchId = requireId(req.params.id, 'batchId');
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

    if (!batch.submissionDeadline) {
      return res.json({
        sent: 0, pending: storeIds.length,
        message: 'No deadline set for this batch. Set a submission deadline before sending reminders.',
      });
    }

    let emailResult = { configured: false, sent: 0, failed: 0 };
    try {
      const { sendDeadlineReminderEmail } = await import('../services/emailService.js');
      emailResult = await sendDeadlineReminderEmail({ managers, inventoryDate: batch.inventoryDate, deadline: batch.submissionDeadline });
    } catch (emailErr) {
      console.error('[batches] Email service error:', emailErr.message);
      emailResult = { configured: true, sent: 0, failed: managers.length };
    }

    createAuditLog({
      userId: req.user.id, action: 'SEND_BATCH_REMINDERS',
      entityType: 'UPLOAD_BATCH', entityId: batchId,
      metadata: { managerCount: managers.length, pendingStores: storeIds.length, emailsSent: emailResult.sent, smtpConfigured: emailResult.configured },
    }).catch(err => console.error('[audit] SEND_BATCH_REMINDERS log failed:', err.message));

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

export async function downloadBatchExportPDF(req, res, next) {
  try {
    const batchId = requireId(req.params.batchId, 'batchId');
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
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

// ── Admin notification feed — parallel queries for minimum latency ─────────────
export async function getNotifications(req, res, next) {
  try {
    const now     = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const latestBatch = await prisma.uploadBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { inventoryDate: 'desc' },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });

    if (!latestBatch) return res.json({ items: [], count: 0 });

    // Run both record queries in parallel instead of sequentially
    const [recentSubmits, pendingStores] = await Promise.all([
      prisma.inventoryRecord.findMany({
        where: { batchId: latestBatch.id, status: 'SUBMITTED', submittedAt: { gte: since24h } },
        select: { storeId: true },
        distinct: ['storeId'],
      }),
      prisma.inventoryRecord.findMany({
        where: { batchId: latestBatch.id, status: 'PENDING' },
        select: { storeId: true },
        distinct: ['storeId'],
      }),
    ]);

    const items = [];
    const dateLabel = new Date(latestBatch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    // AM review status for admin
    const amReviews = await prisma.areaManagerReview.findMany({
      where: { batchId: latestBatch.id },
      select: { status: true, storeId: true },
    });
    const amApproved = amReviews.filter(r => r.status === 'APPROVED').length;
    const amPending  = amReviews.filter(r => r.status === 'PENDING_REVIEW').length;

    if (amApproved > 0) {
      items.push({
        type: 'submitted',
        message: `${amApproved} store${amApproved > 1 ? 's' : ''} approved by Area Manager — ready for review`,
        batchId: latestBatch.id,
        urgent: false,
      });
    }

    if (amPending > 0) {
      items.push({
        type: 'pending',
        message: `${amPending} store${amPending > 1 ? 's' : ''} pending Area Manager review`,
        batchId: latestBatch.id,
        urgent: false,
      });
    }

    if (recentSubmits.length > 0 && amReviews.length === 0) {
      items.push({
        type: 'submitted',
        message: `${recentSubmits.length} store${recentSubmits.length > 1 ? 's' : ''} submitted counts — awaiting Area Manager review`,
        batchId: latestBatch.id,
        urgent: false,
      });
    }

    if (latestBatch.submissionDeadline && pendingStores.length > 0) {
      const deadlineDate = new Date(latestBatch.submissionDeadline);
      const pendingCount = pendingStores.length;
      if (now > deadlineDate) {
        items.push({
          type: 'overdue',
          message: `${pendingCount} store${pendingCount > 1 ? 's have' : ' has'} not submitted — ${dateLabel} deadline passed`,
          batchId: latestBatch.id,
          urgent: true,
        });
      } else {
        const hoursLeft = Math.round((deadlineDate - now) / 3600000);
        if (hoursLeft <= 48) {
          items.push({
            type: 'deadline',
            message: `${pendingCount} store${pendingCount > 1 ? 's' : ''} still pending — ${dateLabel} deadline in ${hoursLeft < 1 ? '<1' : hoursLeft}h`,
            batchId: latestBatch.id,
            urgent: hoursLeft <= 12,
          });
        }
      }
    }

    res.json({ items, count: items.length });
  } catch (error) {
    next(error);
  }
}

// """ Approve a pending (inactive) user — generates temp credentials and activates """"""""""

export async function approveUser(req, res, next) {
  try {
    const userId = requireId(req.params.id, 'userId');

    // Use serializable to prevent two admins simultaneously approving the same pending user
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { store: { select: { id: true, storeCode: true, storeName: true } } },
        });
        if (!user) throw new AppError('User not found', 404);
        if (user.isActive) throw new AppError('User is already active', 409);
        if (!user.pendingApproval) throw new AppError('This user is not in pending approval state', 409);

        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const updated = await tx.user.update({
          where: { id: userId },
          data: { isActive: true, pendingApproval: false, passwordHash, mustChangePassword: true },
          include: { store: { select: { id: true, storeCode: true, storeName: true } } },
        });
        return { updated, tempPassword, original: user };
      }, { isolationLevel: 'Serializable' });
    } catch (txErr) {
      if (txErr?.code === 'P2034') throw new AppError('This user is being approved simultaneously. Please refresh.', 409);
      throw txErr;
    }

    await createAuditLog({
      userId: req.user.id,
      action: 'APPROVE_USER',
      entityType: 'USER',
      entityId: userId,
      metadata: { employeeId: result.original.employeeId, name: result.original.name, source: result.original.source },
    });

    invalidateUserCache(userId);
    sInvalidate('admin:dashboard');
    const { passwordHash: _, ...safeUser } = result.updated;
    res.json({ ...safeUser, tempPassword: result.tempPassword });
  } catch (error) { next(error); }
}

// """ Batch user creation for plants without managers """"""""""""""""""""""""""

export async function getPlantsWithoutUsers(req, res, next) {
  try {
    // Find all plants that have no assigned users
    const plantsWithoutUsers = await prisma.store.findMany({
      where: {
        isActive: true,
        users: {
          none: {}  // No users assigned
        }
      },
      select: {
        id: true,
        storeCode: true,
        storeName: true,
      },
      orderBy: { storeCode: 'asc' }
    });

    res.json(plantsWithoutUsers);
  } catch (error) { next(error); }
}

export async function batchCreateUsersForPlants(req, res, next) {
  try {
    const { plants } = req.body;

    if (!Array.isArray(plants) || plants.length === 0) {
      throw new AppError('plants must be a non-empty array', 400);
    }

    // Validate IDs upfront
    const validPlants = [];
    const errors = [];
    for (const plant of plants) {
      try {
        validPlants.push({ ...plant, parsedStoreId: requireId(plant.storeId, 'storeId') });
      } catch (e) {
        errors.push({ storeId: plant.storeId, error: e.message });
      }
    }

    // Fetch all stores first, then check for duplicate employeeIds using real store codes
    const storeIds = validPlants.map(p => p.parsedStoreId);
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, storeCode: true, storeName: true },
    });
    const storeMap = new Map(stores.map(s => [s.id, s]));

    // Build the correct employeeIds (MGR + storeCode, not MGR + dbId)
    const expectedEmpIds = stores.map(s => `MGR${s.storeCode}`);
    const existingUsers = await prisma.user.findMany({
      where: { employeeId: { in: expectedEmpIds } },
      select: { employeeId: true },
    });
    const existingIds = new Set(existingUsers.map(u => u.employeeId));

    // Build plant data (exclude existing/missing stores)
    const plantData = validPlants.map(plant => {
      const store = storeMap.get(plant.parsedStoreId);
      if (!store) { errors.push({ storeId: plant.parsedStoreId, error: 'Plant not found' }); return null; }
      const employeeId = `MGR${store.storeCode}`;
      if (existingIds.has(employeeId)) { errors.push({ storeId: plant.parsedStoreId, storeCode: store.storeCode, error: `Username ${employeeId} already exists` }); return null; }
      const userName = plant.customName?.trim() || `Manager ${store.storeCode}`;
      return { store, employeeId, userName };
    }).filter(Boolean);

    // Hash all passwords in parallel — sequential bcrypt at cost 10 is ~500ms each
    const withPasswords = await Promise.all(
      plantData.map(async ({ store, employeeId, userName }) => {
        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        return { store, employeeId, userName, tempPassword, passwordHash };
      })
    );

    // Create all users in parallel
    const createdUsers = [];
    await Promise.all(
      withPasswords.map(async ({ store, employeeId, userName, tempPassword, passwordHash }) => {
        try {
          const newUser = await prisma.user.create({
            data: { employeeId, name: userName, passwordHash, role: 'STORE_MANAGER', storeId: store.id, isActive: true, mustChangePassword: true },
            include: { store: { select: { storeCode: true, storeName: true } } },
          }).catch(err => {
            if (err.code === 'P2002') throw new AppError(`Username ${employeeId} already exists`, 409);
            throw err;
          });
          createAuditLog({
            userId: req.user.id, action: 'CREATE_USER', entityType: 'USER', entityId: newUser.id,
            metadata: { employeeId: newUser.employeeId, name: newUser.name, role: newUser.role, storeId: newUser.storeId, batchCreation: true },
          }).catch(() => {});
          createdUsers.push({ id: newUser.id, employeeId: newUser.employeeId, name: newUser.name, storeCode: store.storeCode, storeName: store.storeName, password: tempPassword });
        } catch (err) {
          errors.push({ storeId: store.id, error: err.message || 'Failed to create user' });
        }
      })
    );

    sInvalidate('admin:dashboard');

    res.json({
      message: `Created ${createdUsers.length} user(s)`,
      created: createdUsers,
      errors: errors.length > 0 ? errors : undefined,
      totalRequested: plants.length,
      successCount: createdUsers.length,
      errorCount: errors.length,
    });
  } catch (error) { next(error); }
}

// ══════════════════════════════════════════════════════════════════
// BATCH USER IMPORT  (Excel/CSV upload → preview → commit → pending approval)
// ══════════════════════════════════════════════════════════════════

const USER_IMPORT_COL = {
  name:       ['Name', 'Full Name', 'FullName', 'Employee Name', 'User Name', 'USERNAME', 'NAME'],
  employeeId: ['Employee ID', 'EmployeeID', 'Username', 'Login', 'ID', 'EMPLOYEE_ID', 'EMPLOYEE ID'],
  email:      ['Email', 'Email Address', 'E-mail', 'EMAIL'],
  role:       ['Role', 'ROLE', 'User Role'],
  storeCode:  ['Plant', 'Plant Code', 'Store Code', 'Store', 'StoreCode', 'PLANT', 'STORE CODE'],
  storeName:  ['Plant Name', 'Store Name', 'StoreName', 'PLANT NAME', 'STORE NAME'],
};

function findUserCol(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return cellText(row[alias]);
    }
  }
  return '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRole(raw) {
  if (!raw) return 'STORE_MANAGER';
  const r = raw.toString().trim().toUpperCase();
  if (r === 'ADMIN' || r === 'ADMINISTRATOR') return 'ADMIN';
  return 'STORE_MANAGER';
}

function deriveEmployeeId(storeCode, name) {
  if (storeCode) return 'MGR' + storeCode.toString().toUpperCase().replace(/\s+/g, '');
  if (name) return 'USR' + name.toString().toUpperCase().replace(/\s+/g, '').slice(0, 8);
  return null;
}

/**
 * POST /admin/users/batch-import/preview
 * Parse file, validate all rows, return preview — NO DB writes.
 */
export async function previewUserBatchImport(req, res, next) {
  try {
    if (!req.file) throw new AppError('File is required', 400);

    const rows = await parseFileToRows(req.file);
    if (rows.length === 0) throw new AppError('No data rows found in file', 400);

    const [existingStores, existingUsers] = await Promise.all([
      prisma.store.findMany({ select: { id: true, storeCode: true, storeName: true } }),
      prisma.user.findMany({ select: { employeeId: true, email: true } }),
    ]);
    const storeMap       = new Map(existingStores.map(s => [s.storeCode.trim(), s]));
    const existingIds    = new Set(existingUsers.map(u => u.employeeId));
    const existingEmails = new Set(existingUsers.map(u => u.email).filter(Boolean).map(e => e.toLowerCase()));

    const seenEmailsInFile = new Set();
    const seenIdsInFile    = new Set();
    const preview = [];
    let validCount = 0, invalidCount = 0;
    const newStoreCodes = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row       = rows[i];
      const rowNum    = i + 2;
      const name      = findUserCol(row, USER_IMPORT_COL.name).trim();
      const emailRaw  = findUserCol(row, USER_IMPORT_COL.email).trim();
      const roleRaw   = findUserCol(row, USER_IMPORT_COL.role);
      const storeCode = findUserCol(row, USER_IMPORT_COL.storeCode).trim().toUpperCase();
      let   empId     = findUserCol(row, USER_IMPORT_COL.employeeId).trim();
      const email     = emailRaw ? emailRaw.toLowerCase() : null;
      const role      = normalizeRole(roleRaw);

      if (!empId) empId = deriveEmployeeId(storeCode, name) || '';

      const errors = [];
      if (!name)   errors.push('Missing Name');
      if (!empId)  errors.push('Cannot derive Employee ID — provide a Plant Code or Name');
      if (email && !isValidEmail(email)) errors.push('Invalid email format');
      if (email && seenEmailsInFile.has(email)) errors.push('Duplicate email in this file');
      if (empId && seenIdsInFile.has(empId))    errors.push('Duplicate Employee ID in this file');
      if (empId && existingIds.has(empId))       errors.push('Employee ID already exists in system');
      if (email && existingEmails.has(email))    errors.push('Email already exists in system');
      if (role === 'STORE_MANAGER' && !storeCode) errors.push('Store Manager must have a Plant Code');

      if (email && !seenEmailsInFile.has(email)) seenEmailsInFile.add(email);
      if (empId && !seenIdsInFile.has(empId))    seenIdsInFile.add(empId);

      let storeStatus = null;
      let resolvedStoreId = null;
      if (storeCode) {
        if (storeMap.has(storeCode)) {
          resolvedStoreId = storeMap.get(storeCode).id;
          storeStatus = 'existing';
        } else {
          storeStatus = 'new';
          newStoreCodes.add(storeCode);
        }
      }

      const isValid = errors.length === 0;
      if (isValid) validCount++; else invalidCount++;

      preview.push({
        row: rowNum, name, employeeId: empId || null, email,
        role, storeCode: storeCode || null,
        storeName: storeCode && storeMap.get(storeCode)?.storeName || null,
        storeStatus, resolvedStoreId,
        status: isValid ? 'valid' : 'invalid',
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    res.json({
      fileName: req.file.originalname,
      totalRows: rows.length,
      validRows: validCount,
      invalidRows: invalidCount,
      newStores: Array.from(newStoreCodes),
      preview,
      canCommit: validCount > 0,
    });
  } catch (error) { next(error); }
}

/**
 * POST /admin/users/batch-import/commit
 * Re-parse + re-validate (never trust frontend alone), create missing stores,
 * create pending (isActive=false, pendingApproval=true, source=BATCH_IMPORT) users.
 * Wrapped in a serializable transaction for safety.
 */
export async function commitUserBatchImport(req, res, next) {
  try {
    if (!req.file) throw new AppError('File is required', 400);

    const rows = await parseFileToRows(req.file);
    if (rows.length === 0) throw new AppError('No data rows found in file', 400);

    const adminId  = req.user.id;
    const fileName = req.file.originalname;

    let txResult;
    try {
      txResult = await prisma.$transaction(async (tx) => {
        const [existingStores, existingUsers] = await Promise.all([
          tx.store.findMany({ select: { id: true, storeCode: true, storeName: true } }),
          tx.user.findMany({ select: { employeeId: true, email: true } }),
        ]);
        const storeMap       = new Map(existingStores.map(s => [s.storeCode.trim(), s]));
        const existingIds    = new Set(existingUsers.map(u => u.employeeId));
        const existingEmails = new Set(existingUsers.map(u => u.email).filter(Boolean).map(e => e.toLowerCase()));

        const seenEmailsInFile = new Set();
        const seenIdsInFile    = new Set();

        // Collect new store codes from valid rows
        const newStoreCodes = new Set();
        for (const row of rows) {
          const sc = findUserCol(row, USER_IMPORT_COL.storeCode).trim().toUpperCase();
          if (sc && !storeMap.has(sc)) newStoreCodes.add(sc);
        }

        // Create missing stores (check again inside tx for concurrent creates)
        const createdStores = [];
        for (const code of newStoreCodes) {
          const already = await tx.store.findUnique({ where: { storeCode: code } });
          if (!already) {
            const newStore = await tx.store.create({
              data: { storeCode: code, storeName: 'Store ' + code, isActive: true },
            });
            storeMap.set(code, newStore);
            createdStores.push({ storeCode: code, storeName: newStore.storeName });
          } else {
            storeMap.set(code, already);
          }
        }

        const created = [];
        const skipped = [];
        const placeholder = await bcrypt.hash(randomBytes(16).toString('hex'), 10);

        for (let i = 0; i < rows.length; i++) {
          const row       = rows[i];
          const rowNum    = i + 2;
          const name      = findUserCol(row, USER_IMPORT_COL.name).trim();
          const emailRaw  = findUserCol(row, USER_IMPORT_COL.email).trim();
          const roleRaw   = findUserCol(row, USER_IMPORT_COL.role);
          const storeCode = findUserCol(row, USER_IMPORT_COL.storeCode).trim().toUpperCase();
          let   empId     = findUserCol(row, USER_IMPORT_COL.employeeId).trim();
          const email     = emailRaw ? emailRaw.toLowerCase() : null;
          const role      = normalizeRole(roleRaw);
          if (!empId) empId = deriveEmployeeId(storeCode, name) || '';

          const errors = [];
          if (!name)   errors.push('Missing Name');
          if (!empId)  errors.push('Cannot derive Employee ID');
          if (email && !isValidEmail(email)) errors.push('Invalid email');
          if (email && seenEmailsInFile.has(email)) errors.push('Duplicate email in file');
          if (empId && seenIdsInFile.has(empId))    errors.push('Duplicate Employee ID in file');
          if (empId && existingIds.has(empId))       errors.push('Employee ID already exists');
          if (email && existingEmails.has(email))    errors.push('Email already exists');
          if (role === 'STORE_MANAGER' && !storeCode) errors.push('Missing Plant Code');

          if (email) seenEmailsInFile.add(email);
          if (empId) { seenIdsInFile.add(empId); existingIds.add(empId); }
          if (email) existingEmails.add(email);

          if (errors.length > 0) {
            skipped.push({ row: rowNum, employeeId: empId, name, errors });
            continue;
          }

          const storeEntry = storeCode ? storeMap.get(storeCode) : null;
          const newUser = await tx.user.create({
            data: {
              employeeId: empId, name, passwordHash: placeholder, role,
              storeId: storeEntry?.id ?? null,
              isActive: false, pendingApproval: true, source: 'BATCH_IMPORT',
              email: email || null,
            },
          });
          created.push({
            id: newUser.id, employeeId: newUser.employeeId,
            name: newUser.name, email: newUser.email, role: newUser.role,
            storeCode: storeCode || null,
          });
        }

        return { created, skipped, createdStores };
      }, { isolationLevel: 'Serializable' });
    } catch (txErr) {
      if (txErr?.code === 'P2034') {
        return next(new AppError('Another import is in progress. Please try again.', 409));
      }
      return next(txErr);
    }

    createAuditLog({
      userId: adminId, action: 'BATCH_USER_IMPORT', entityType: 'USER', entityId: null,
      metadata: {
        fileName, totalRows: rows.length,
        created: txResult.created.length, skipped: txResult.skipped.length,
        newStores: txResult.createdStores.map(s => s.storeCode),
        createdUserIds: txResult.created.map(u => u.id),
      },
    }).catch(() => {});

    sInvalidate('admin:dashboard');
    res.status(201).json({
      message:       txResult.created.length + ' pending user(s) created, awaiting admin approval',
      created:       txResult.created,
      skipped:       txResult.skipped.length > 0 ? txResult.skipped : undefined,
      newStores:     txResult.createdStores,
      createdCount:  txResult.created.length,
      skippedCount:  txResult.skipped.length,
      newStoreCount: txResult.createdStores.length,
    });
  } catch (error) { next(error); }
}

/**
 * POST /admin/users/:id/reject
 * Delete a pending user and record the rejection in AuditLog.
 * Does NOT delete the associated store.
 */
export async function rejectUser(req, res, next) {
  try {
    const userId    = requireId(req.params.id, 'userId');
    const { reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, employeeId: true, name: true, source: true, pendingApproval: true, isActive: true },
    });
    if (!user)                throw new AppError('User not found', 404);
    if (!user.pendingApproval) throw new AppError('User is not in pending approval state', 409);
    if (user.isActive)         throw new AppError('Cannot reject an already active user', 409);

    await prisma.user.delete({ where: { id: userId } });
    invalidateUserCache(userId);

    createAuditLog({
      userId: req.user.id, action: 'REJECT_USER',
      entityType: 'USER', entityId: userId,
      metadata: { employeeId: user.employeeId, name: user.name, source: user.source, reason: reason || null },
    }).catch(() => {});

    sInvalidate('admin:dashboard');
    res.json({ message: `"${user.name}" (${user.employeeId}) rejected and removed` });
  } catch (error) {
    if (error.code === 'P2025') return next(new AppError('User not found or already removed', 404));
    next(error);
  }
}

/**
 * POST /admin/users/bulk-review
 * Body: { action: 'approve'|'reject', userIds: number[], reason?: string }
 * Approve or reject multiple pending users at once.
 */
export async function bulkReviewUsers(req, res, next) {
  try {
    const { action, userIds, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) throw new AppError('action must be "approve" or "reject"', 400);
    if (!Array.isArray(userIds) || userIds.length === 0) throw new AppError('userIds must be a non-empty array', 400);

    const parsedIds = userIds.map((id, i) => requireId(id, 'userIds[' + i + ']'));

    // Fetch candidates with retry logic for cold DB connections
    let candidates;
    try {
      candidates = await prisma.user.findMany({
        where: { id: { in: parsedIds }, pendingApproval: true, isActive: false },
        include: { store: { select: { id: true, storeCode: true, storeName: true } } },
      });
    } catch (firstErr) {
      console.warn('[bulkReviewUsers] First DB query failed, retrying after reconnect:', firstErr.message);
      try {
        await new Promise(r => setTimeout(r, 300));
        await prisma.$connect();
        candidates = await prisma.user.findMany({
          where: { id: { in: parsedIds }, pendingApproval: true, isActive: false },
          include: { store: { select: { id: true, storeCode: true, storeName: true } } },
        });
      } catch (retryErr) {
        console.error('[bulkReviewUsers] DB unavailable after retry:', retryErr.message);
        throw new AppError('Unable to reach the database. Please try again in a moment.', 503);
      }
    }

    if (candidates.length === 0) throw new AppError('No pending users found for the provided IDs', 404);

    const approved = [];
    const rejected = [];
    const errors   = [];

    if (action === 'approve') {
      // Generate all passwords and hash them in parallel — sequential bcrypt at
      // cost 10 on a slow CPU (free tier) takes ~500ms each, so 40 users = 20s.
      // Parallel: all 40 hash in ~500ms total.
      const withPasswords = await Promise.all(
        candidates.map(async user => {
          const tempPassword = generateTempPassword();
          const passwordHash = await bcrypt.hash(tempPassword, 10);
          return { user, tempPassword, passwordHash };
        })
      );

      // Update all users in parallel
      await Promise.all(
        withPasswords.map(async ({ user, tempPassword, passwordHash }) => {
          try {
            await prisma.user.update({
              where: { id: user.id, pendingApproval: true, isActive: false },
              data:  { isActive: true, pendingApproval: false, passwordHash, mustChangePassword: true },
            });
            createAuditLog({
              userId: req.user.id, action: 'APPROVE_USER',
              entityType: 'USER', entityId: user.id,
              metadata: { employeeId: user.employeeId, name: user.name, bulk: true },
            }).catch(() => {});
            approved.push({ id: user.id, employeeId: user.employeeId, name: user.name, tempPassword, store: user.store });
          } catch (e) {
            errors.push({ id: user.id, employeeId: user.employeeId, error: e.message });
          }
        })
      );
    } else {
      // Reject: delete all in parallel
      await Promise.all(
        candidates.map(async user => {
          try {
            await prisma.user.delete({ where: { id: user.id, pendingApproval: true, isActive: false } });
            createAuditLog({
              userId: req.user.id, action: 'REJECT_USER',
              entityType: 'USER', entityId: user.id,
              metadata: { employeeId: user.employeeId, name: user.name, bulk: true, reason: reason || null },
            }).catch(() => {});
            rejected.push({ id: user.id, employeeId: user.employeeId, name: user.name });
          } catch (e) {
            errors.push({ id: user.id, employeeId: user.employeeId, error: e.message });
          }
        })
      );
    }

    sInvalidate('admin:dashboard');
    res.json({
      action,
      approved: approved.length > 0 ? approved : undefined,
      rejected: rejected.length > 0 ? rejected : undefined,
      errors:   errors.length   > 0 ? errors   : undefined,
      summary:  (approved.length + rejected.length) + ' processed, ' + errors.length + ' failed',
    });
  } catch (error) { next(error); }
}

// ── Bulk delete any users (not just pending) ───────────────────────────────────
export async function bulkDeleteUsers(req, res, next) {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new AppError('userIds must be a non-empty array', 400);
    }

    const parsedIds = userIds.map((id, i) => requireId(id, `userIds[${i}]`));

    // Cannot delete yourself
    if (parsedIds.includes(req.user.id)) {
      throw new AppError('You cannot delete your own account', 400);
    }

    // Fetch candidates and validate admin count
    const [toDelete, totalAdmins] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: parsedIds } },
        select: { id: true, role: true, isActive: true, employeeId: true, name: true },
      }),
      prisma.user.count({ where: { role: 'ADMIN', isActive: true } }),
    ]);

    if (toDelete.length === 0) throw new AppError('No matching users found', 404);

    // Only count active admins in the safety check — deleting an inactive admin
    // should not trigger the "last admin" guard.
    const deletingActiveAdmins = toDelete.filter(u => u.role === 'ADMIN' && u.isActive).length;
    if (deletingActiveAdmins > 0 && totalAdmins - deletingActiveAdmins < 1) {
      throw new AppError('Cannot delete all administrator accounts — at least one must remain', 400);
    }

    const validIds = toDelete.map(u => u.id);

    // Transaction: clean up FK references then hard-delete
    await prisma.$transaction(async (tx) => {
      await tx.uploadBatch.updateMany({ where: { uploadedBy: { in: validIds } }, data: { uploadedBy: req.user.id } });
      await tx.batchDeadlineExtension.updateMany({ where: { grantedBy: { in: validIds } }, data: { grantedBy: req.user.id } });
      await tx.inventoryRecord.updateMany({ where: { submittedBy: { in: validIds } }, data: { submittedBy: null } });
      await tx.auditLog.updateMany({ where: { userId: { in: validIds } }, data: { userId: null } });
      await tx.user.deleteMany({ where: { id: { in: validIds } } });
    });

    validIds.forEach(id => invalidateUserCache(id));

    createAuditLog({
      userId: req.user.id, action: 'BULK_DELETE_USERS',
      entityType: 'USER', entityId: null,
      metadata: { ids: validIds, count: validIds.length },
    }).catch(() => {});

    sInvalidate('admin:dashboard');
    res.json({ deleted: validIds.length, message: `${validIds.length} user(s) permanently deleted` });
  } catch (error) {
    if (error.code === 'P2025') return next(new AppError('One or more users not found', 404));
    next(error);
  }
}
