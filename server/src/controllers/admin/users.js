// User accounts: creation, edits, approval, deletion, and the spreadsheet import.

import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../services/auditService.js';
import { logger, errorDetails } from '../../config/logger.js';
import prisma from '../../config/prisma.js';
import { sGet, sSet, sInvalidate } from '../../services/serverCache.js';
import { requireId } from '../../utils/params.js';
import { invalidateUserCache } from '../../middleware/auth.js';
import { validatePassword } from '../authController.js';
import { generateTempPassword } from './shared.js';
import { cellText, parseFileToRows } from './uploads.js';

export async function getUsers(req, res, next) {
  try {
    const cached = sGet('admin:users');
    if (cached) return res.json(cached);

    const users = await prisma.user.findMany({
      orderBy: { employeeId: 'asc' },
      select: {
        id: true, employeeId: true, name: true, role: true,
        storeId: true, isActive: true, pendingApproval: true,
        source: true, email: true, phone: true, createdAt: true,
        store: { select: { id: true, storeCode: true, storeName: true } },
      },
    });

    sSet('admin:users', users, 60_000);
    res.json(users);
  } catch (error) {
    next(error);
  }
}

export async function createUser(req, res, next) {
  try {
    const { employeeId, name, password, role, storeId, isActive, email, phone } = req.body;

    if (!employeeId || !name || !password || !role) {
      throw new AppError('Employee ID, full name, password, and role are all required', 400);
    }

    const VALID_ROLES = new Set(['ADMIN', 'AREA_MANAGER', 'STORE_MANAGER']);
    if (!VALID_ROLES.has(role)) throw new AppError('Please select a valid role: Admin, Area Manager, or Store Manager', 400);

    if (role === 'STORE_MANAGER' && !storeId) {
      throw new AppError('Store Managers must be assigned to a store', 400);
    }

    if ((role === 'ADMIN' || role === 'AREA_MANAGER') && storeId) {
      throw new AppError('Admins and Area Managers are not assigned to individual stores', 400);
    }

    validatePassword(password);

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await prisma.user.create({
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
        include: { store: true },
      });
    } catch (createErr) {
      // Prisma DLL may be stale and not recognise AREA_MANAGER — bypass with raw SQL
      if (createErr.message?.includes('Expected UserRole') || createErr.message?.includes('PrismaClientValidationError')) {
        const rows = await prisma.$queryRaw`
          INSERT INTO "User" ("employeeId", name, "passwordHash", role, "storeId", "isActive", email, phone, "createdAt", "updatedAt")
          VALUES (
            ${employeeId}, ${name}, ${passwordHash}, ${role}::"UserRole",
            ${storeId ? requireId(storeId, 'storeId') : null},
            ${isActive !== undefined ? isActive : true},
            ${email || null}, ${phone || null},
            NOW(), NOW()
          )
          RETURNING id, "employeeId", name, role, "storeId", "isActive", "pendingApproval",
                    "mustChangePassword", source, email, phone, "createdAt", "updatedAt"
        `;
        user = { ...rows[0], store: null };
      } else {
        throw createErr;
      }
    }

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE_USER',
      entityType: 'USER',
      entityId: user.id,
      metadata: { employeeId, name, role },
    });

    sInvalidate('admin:users');
    if (storeId) sInvalidate('admin:stores'); // store's manager count changed

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('email') ? 'Email address' : 'Employee ID';
      return next(new AppError(`${field} is already in use`, 409));
    }
    // Raw SQL unique violation (PostgreSQL error code 23505)
    if (error.code === '23505') {
      const field = error.detail?.includes('email') ? 'Email address' : 'Employee ID';
      return next(new AppError(`${field} is already in use`, 409));
    }
    next(error);
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

    if (currentUser.pendingApproval) {
      throw new AppError('Cannot edit users in pending approval state. Please approve or reject first.', 400);
    }

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
        throw new AppError('Admins and Area Managers are not assigned to individual stores', 400);
      }
      if (parsedStoreId) {
        data.store = { connect: { id: parsedStoreId } };
      } else if (currentUser.storeId) {
        data.store = { disconnect: true };
      }
    }

    if (password) {
      validatePassword(password);
      data.passwordHash = await bcrypt.hash(password, 10);
      // Admin-reset passwords must be changed on next login
      data.mustChangePassword = true;
    }

    // An admin-issued password reset has to end live sessions the same way a
    // self-service change does (see authController.changePassword). Without this a
    // stolen refresh token survives the reset for its full 7-day life, so resetting
    // the password of a compromised account does not actually lock the attacker out.
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data,
        include: { store: true },
      }),
      ...(data.passwordHash ? [prisma.refreshToken.deleteMany({ where: { userId } })] : []),
    ]);

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE_USER',
      entityType: 'USER',
      entityId: user.id,
      metadata: { employeeId: user.employeeId, name: user.name, role: user.role, isActive },
    });

    invalidateUserCache(userId);
    sInvalidate('admin:users');
    if (storeId !== undefined) sInvalidate('admin:stores'); // manager count changed on store card
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

export async function deleteUser(req, res, next) {
  try {
    const userId = requireId(req.params.id, 'userId');

    if (userId === req.user.id) {
      throw new AppError('You cannot delete your own account while logged in', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    // Wrap all FK reassignments + delete in a single transaction.
    // Admin count check is inside the transaction to prevent TOCTOU: two concurrent
    // deletes could both pass the count check outside and wipe all admins.
    await prisma.$transaction(async (tx) => {
      if (user.role === 'ADMIN') {
        const adminCount = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (adminCount <= 1) {
          throw new AppError('At least one active administrator account must remain. Assign another admin before deleting this one', 400);
        }
      }
      // Reassign non-nullable FK references to the deleting admin so data isn't orphaned
      await tx.uploadBatch.updateMany({ where: { uploadedBy: userId }, data: { uploadedBy: req.user.id } });
      await tx.batchDeadlineExtension.updateMany({ where: { grantedBy: userId }, data: { grantedBy: req.user.id } });
      // CycleSchedule.createdBy is NOT NULL — reassign to the deleting admin
      await tx.cycleSchedule.updateMany({ where: { createdBy: userId }, data: { createdBy: req.user.id } });
      // Null out nullable FK references
      await tx.inventoryRecord.updateMany({ where: { submittedBy: userId }, data: { submittedBy: null } });
      await tx.auditLog.updateMany({ where: { userId }, data: { userId: null } });
      if (user.role === 'AREA_MANAGER') {
        // Store.areaManagerId is nullable — unassign stores so the FK doesn't block the delete
        await tx.store.updateMany({ where: { areaManagerId: userId }, data: { areaManagerId: null } });
        // AreaManagerReview.areaManagerId is NOT nullable — delete reviews before deleting the user
        await tx.areaManagerReview.deleteMany({ where: { areaManagerId: userId } });
      }
      await tx.user.delete({ where: { id: userId } });
    });

    invalidateUserCache(userId);
    sInvalidate('admin:users');

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
    sInvalidate('admin:dashboard', 'admin:users', 'admin:stores');
    const { passwordHash: _, ...safeUser } = result.updated;
    res.json({ ...safeUser, tempPassword: result.tempPassword });
  } catch (error) { next(error); }
}

// """ Batch user creation for plants without managers """"""""""""""""""""""""""

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

    // One summary entry for the run itself — the per-user CREATE_USER rows above do
    // not tell you that a single batch operation produced them, and BATCH_CREATE_USERS
    // is an offered audit filter that would otherwise never match anything.
    if (createdUsers.length > 0) {
      createAuditLog({
        userId: req.user.id, action: 'BATCH_CREATE_USERS', entityType: 'USER', entityId: null,
        metadata: { requested: plants.length, created: createdUsers.length, failed: errors.length },
      }).catch(() => {});
    }

    sInvalidate('admin:dashboard', 'admin:users', 'admin:stores');

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

    sInvalidate('admin:dashboard', 'admin:users', 'admin:stores');
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
    sInvalidate('admin:users');

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
      logger.warn('bulkReviewUsers first DB query failed, retrying after reconnect', errorDetails(firstErr));
      try {
        await new Promise(r => setTimeout(r, 300));
        await prisma.$connect();
        candidates = await prisma.user.findMany({
          where: { id: { in: parsedIds }, pendingApproval: true, isActive: false },
          include: { store: { select: { id: true, storeCode: true, storeName: true } } },
        });
      } catch (retryErr) {
        logger.error('bulkReviewUsers DB unavailable after retry', errorDetails(retryErr));
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

    sInvalidate('admin:dashboard', 'admin:users', 'admin:stores');
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

    const amIds = toDelete.filter(u => u.role === 'AREA_MANAGER').map(u => u.id);

    // Transaction: clean up all FK references then hard-delete
    await prisma.$transaction(async (tx) => {
      await tx.uploadBatch.updateMany({ where: { uploadedBy: { in: validIds } }, data: { uploadedBy: req.user.id } });
      await tx.batchDeadlineExtension.updateMany({ where: { grantedBy: { in: validIds } }, data: { grantedBy: req.user.id } });
      // CycleSchedule.createdBy is NOT NULL — reassign to the acting admin
      await tx.cycleSchedule.updateMany({ where: { createdBy: { in: validIds } }, data: { createdBy: req.user.id } });
      await tx.inventoryRecord.updateMany({ where: { submittedBy: { in: validIds } }, data: { submittedBy: null } });
      await tx.auditLog.updateMany({ where: { userId: { in: validIds } }, data: { userId: null } });
      if (amIds.length > 0) {
        // Unassign stores from deleted AMs so the FK doesn't block the delete
        await tx.store.updateMany({ where: { areaManagerId: { in: amIds } }, data: { areaManagerId: null } });
        await tx.areaManagerReview.deleteMany({ where: { areaManagerId: { in: amIds } } });
      }
      await tx.user.deleteMany({ where: { id: { in: validIds } } });
    });

    validIds.forEach(id => invalidateUserCache(id));
    sInvalidate('admin:users', 'admin:stores');

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
