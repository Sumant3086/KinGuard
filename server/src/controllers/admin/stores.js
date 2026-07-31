// Store records: creation, edits, and the several kinds of deletion.

import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../services/auditService.js';
import prisma from '../../config/prisma.js';
import { sGet, sSet, sInvalidate } from '../../services/serverCache.js';
import { requireId } from '../../utils/params.js';

export async function getStores(req, res, next) {
  try {
    const cached = sGet('admin:stores');
    if (cached) return res.json(cached);

    const stores = await prisma.store.findMany({
      orderBy: { storeCode: 'asc' },
      include: {
        _count: { select: { users: true, inventoryRecords: true } },
      },
    });

    sSet('admin:stores', stores, 120_000);
    res.json(stores);
  } catch (error) {
    next(error);
  }
}

export async function createStore(req, res, next) {
  try {
    const { storeCode, storeName, isActive } = req.body;

    if (!storeCode || !storeName) {
      throw new AppError('Both a plant code and plant name are required', 400);
    }

    const normalizedCode = storeCode.toString().trim().toUpperCase();
    if (!normalizedCode) throw new AppError('Plant code cannot be blank', 400);
    if (normalizedCode.length > 50) throw new AppError('Plant code cannot be longer than 50 characters', 400);

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
      metadata: { storeCode: store.storeCode, storeName: store.storeName },
    });

    sInvalidate('admin:dashboard', 'admin:stores');
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
        `This store has ${store._count.inventoryRecords} inventory record${store._count.inventoryRecords > 1 ? 's' : ''} and cannot be deleted. Deactivate it instead to hide it from reports`,
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

    sInvalidate('admin:dashboard', 'admin:stores');
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
      metadata: { storeCode: store.storeCode, storeName: store.storeName, isActive },
    });

    sInvalidate('admin:dashboard', 'admin:stores');
    res.json(store);
  } catch (error) {
    next(error);
  }
}

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

      sInvalidate('admin:dashboard', 'admin:stores');
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

    sInvalidate('admin:dashboard', 'admin:stores');
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

    sInvalidate('admin:dashboard', 'admin:stores');
    res.json({ message: 'Store and all its data permanently deleted' });
  } catch (error) { next(error); }
}

// """ Batch (cycle) deletion """""""""""""""""""""""""""""""""""""""""""""""""""

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
