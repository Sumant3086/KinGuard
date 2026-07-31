// Cross-store inventory reads and the admin override paths.

import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../services/auditService.js';
import { logger } from '../../config/logger.js';
import prisma from '../../config/prisma.js';
import { sInvalidate } from '../../services/serverCache.js';
import { parseId, requireId, parsePage, parsePageSize } from '../../utils/params.js';
import { VALID_SHRINKAGE_CATEGORIES } from '../../utils/shrinkageCategories.js';
import { computeDifference } from '../../utils/inventoryMath.js';
import { BULK_OVERRIDE_LIMIT } from './shared.js';

export async function getInventory(req, res, next) {
  const startTime = Date.now();
  try {
    const { search } = req.query;
    const status      = req.query.status      || undefined;
    const discrepancy = req.query.discrepancy || undefined;
    const storeId     = parseId(req.query.storeId, 'storeId');
    const batchId     = parseId(req.query.batchId, 'batchId');
    const pageNum     = parsePage(req.query.page, 1);
    const pageSizeNum = parsePageSize(req.query.pageSize, 50, 200);

    if (!batchId && !storeId) throw new AppError('A batchId or storeId filter is required', 400);

    const VALID_STATUSES = new Set(['PENDING', 'SUBMITTED']);
    if (status && !VALID_STATUSES.has(status)) throw new AppError('Invalid status filter', 400);
    const VALID_DISC = new Set(['shortage', 'excess', 'matched']);
    if (discrepancy && !VALID_DISC.has(discrepancy)) throw new AppError('Invalid discrepancy filter', 400);

    // Deleted cycles are soft-deleted, so their records survive. Without this the
    // rows of a cycle the admin already removed still land in store-filtered results.
    const where = { batch: { isDeleted: false } };

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
        // materialCode as secondary sort ensures stable pagination when many records
        // share the same createdAt (e.g. bulk-uploaded in a single createMany call)
        orderBy: [{ createdAt: 'desc' }, { materialCode: 'asc' }],
        skip,
        take: pageSizeNum,
        include: {
          store: { select: { storeCode: true, storeName: true } },
        },
      }),
    ]);

    // isRepeat is stored on each record at submission time by detectRepeatDiscrepancies.
    // No second cross-batch query needed — the flag is read directly from the DB.
    // Default to false for records created before the flag was introduced.
    const enrichedRecords = records.map(r => ({ ...r, isRepeat: r.isRepeat ?? false }));

    const duration = Date.now() - startTime;
    logger.debug('Admin inventory page built', { records: records.length, page: pageNum, durationMs: duration });

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

export async function overrideInventoryRecord(req, res, next) {
  try {
    const recordId = requireId(req.params.id, 'recordId');
    const { physicalQuantity, systemQuantity, remarks, shrinkageCategory, status } = req.body;

    const record = await prisma.inventoryRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new AppError('Record not found', 404);

    const updateData = {};

    // The system quantity is correctable here at any time, including after submission.
    // An upload may leave the column blank for the store to supply, so a wrong baseline
    // is now something a store can introduce — the admin needs a way to fix it without
    // re-uploading the whole cycle. Every override is written to the audit trail.
    let effectiveSysQty = record.systemQuantity;
    if (systemQuantity !== undefined) {
      const sys = systemQuantity !== null && systemQuantity !== '' ? parseFloat(systemQuantity) : null;
      if (sys !== null && isNaN(sys)) throw new AppError('Invalid system quantity', 400);
      if (sys !== null && sys < 0) throw new AppError('System quantity cannot be negative', 400);
      updateData.systemQuantity = sys;
      effectiveSysQty = sys;
    }

    if (physicalQuantity !== undefined) {
      const qty = physicalQuantity !== null && physicalQuantity !== '' ? parseFloat(physicalQuantity) : null;
      if (qty !== null && isNaN(qty)) throw new AppError('Invalid quantity', 400);
      if (qty !== null && qty < 0) throw new AppError('Physical quantity cannot be negative', 400);
      updateData.physicalQuantity = qty;
      updateData.difference = computeDifference(qty, effectiveSysQty);
    } else if (systemQuantity !== undefined) {
      // Baseline moved on its own — the variance has to follow it.
      updateData.difference = computeDifference(record.physicalQuantity, effectiveSysQty);
    }

    if (remarks !== undefined) updateData.remarks = remarks || null;
    if (shrinkageCategory !== undefined) {
      if (shrinkageCategory && !VALID_SHRINKAGE_CATEGORIES.has(shrinkageCategory)) {
        throw new AppError('Invalid shrinkage category', 400);
      }
      updateData.shrinkageCategory = shrinkageCategory || null;
    }
    if (status !== undefined) {
      if (!['PENDING', 'SUBMITTED'].includes(status)) throw new AppError('Invalid status', 400);
      if (status === 'SUBMITTED') {
        const finalPhysQty = updateData.physicalQuantity !== undefined
          ? updateData.physicalQuantity
          : record.physicalQuantity;
        if (finalPhysQty === null || finalPhysQty === undefined) {
          throw new AppError('Cannot mark as submitted without a physical stock quantity', 400);
        }
        // Same reason the store's own submit is blocked: a submitted record with a blank
        // baseline has a variance that can never be computed, and the discrepancy checks
        // downstream all read `difference`, so it would pass through as if it matched.
        if (effectiveSysQty === null || effectiveSysQty === undefined) {
          throw new AppError('Cannot mark as submitted without a system stock quantity', 400);
        }
        updateData.submittedBy = req.user.id;
        updateData.submittedAt = new Date();
      } else {
        // Resetting to PENDING clears all count data so the store re-enters fresh
        updateData.physicalQuantity  = null;
        updateData.difference        = null;
        updateData.submittedBy       = null;
        updateData.submittedAt       = null;
        updateData.shrinkageCategory = null;
        updateData.remarks           = null;
        updateData.isRepeat          = false; // re-evaluated when the store re-submits
      }
      updateData.status = status;
    }

    const updated = await prisma.inventoryRecord.update({
      where: { id: recordId },
      data: updateData,
      include: { store: { select: { storeCode: true, storeName: true, areaManagerId: true } } },
    });

    await createAuditLog({
      userId: req.user.id, action: 'OVERRIDE_RECORD',
      entityType: 'INVENTORY_RECORD', entityId: recordId,
      metadata: {
        before: {
          physicalQuantity: record.physicalQuantity,
          // The audited baseline is now correctable, so a change to it has to be traceable.
          systemQuantity: record.systemQuantity,
          difference: record.difference,
          remarks: record.remarks,
          status: record.status,
        },
        after: updateData,
      },
    });

    sInvalidate('admin:dashboard', 'admin:batches', 'admin:notifications',
                `store:dashboard:${record.storeId}`,
                `store:notifications:${record.storeId}`);
    if (updated.store?.areaManagerId) {
      sInvalidate(`am:batches:${updated.store.areaManagerId}`,
                  `am:notifications:${updated.store.areaManagerId}`);
    }
    res.json(updated);
  } catch (error) { next(error); }
}

// ── Bulk admin override of multiple inventory records ─────────────────────────
// action = 'reset'  → clears all count data, returns records to PENDING
// action = 'match'  → sets physicalQuantity = systemQuantity (exact match), marks SUBMITTED

export async function bulkOverrideInventory(req, res, next) {
  try {
    const { recordIds, action } = req.body;

    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      throw new AppError('recordIds must be a non-empty array', 400);
    }
    if (!['reset', 'match'].includes(action)) {
      throw new AppError('action must be "reset" or "match"', 400);
    }
    if (recordIds.length > BULK_OVERRIDE_LIMIT) {
      throw new AppError(`Cannot override more than ${BULK_OVERRIDE_LIMIT} records at once`, 400);
    }

    const parsedIds = recordIds.map((id, i) => requireId(id, `recordIds[${i}]`));

    // Load the affected records up front — both branches need the store (and its area
    // manager) so every cached view of these rows can be busted, not just the admin one.
    const records = await prisma.inventoryRecord.findMany({
      where: { id: { in: parsedIds } },
      select: {
        id: true,
        systemQuantity: true,
        storeId: true,
        store: { select: { areaManagerId: true } },
      },
    });
    if (records.length === 0) throw new AppError('No matching records found', 404);

    const bustCaches = () => {
      const storeIds = [...new Set(records.map(r => r.storeId))];
      const amIds    = [...new Set(records.map(r => r.store?.areaManagerId).filter(Boolean))];
      sInvalidate('admin:dashboard', 'admin:batches', 'admin:notifications',
                  ...storeIds.flatMap(id => [`store:dashboard:${id}`, `store:notifications:${id}`]),
                  ...amIds.flatMap(id => [`am:batches:${id}`, `am:notifications:${id}`]));
    };

    if (action === 'reset') {
      const result = await prisma.inventoryRecord.updateMany({
        where: { id: { in: parsedIds } },
        data: {
          status:            'PENDING',
          physicalQuantity:  null,
          difference:        null,
          shrinkageCategory: null,
          remarks:           null,
          isRepeat:          false,
          submittedBy:       null,
          submittedAt:       null,
        },
      });

      await createAuditLog({
        userId: req.user.id,
        action: 'BULK_OVERRIDE_RECORDS',
        entityType: 'INVENTORY_RECORD',
        entityId: null,
        metadata: { action: 'reset', count: result.count, recordIds: parsedIds.slice(0, 50) },
      });

      bustCaches();
      return res.json({ updated: result.count, message: `${result.count} record(s) reset to Pending` });
    }

    // action === 'match': per-record update so each difference is computed against its own systemQuantity.
    // A record whose systemQuantity is blank has nothing to match against — copying the
    // blank across and calling the difference 0 would assert a perfect count for an item
    // with no figures at all, so those are skipped and reported back instead.
    const matchable = records.filter(r => r.systemQuantity !== null);
    const skipped   = records.length - matchable.length;
    if (matchable.length === 0) {
      throw new AppError('These records have no system quantity to match against. Enter a system quantity first', 400);
    }

    await prisma.$transaction(
      matchable.map(r =>
        prisma.inventoryRecord.update({
          where: { id: r.id },
          data: {
            status:            'SUBMITTED',
            physicalQuantity:  r.systemQuantity,
            difference:        0,
            shrinkageCategory: null,
            remarks:           null,
            isRepeat:          false,
            submittedBy:       req.user.id,
            submittedAt:       new Date(),
          },
        })
      )
    );

    await createAuditLog({
      userId: req.user.id,
      action: 'BULK_OVERRIDE_RECORDS',
      entityType: 'INVENTORY_RECORD',
      entityId: null,
      metadata: { action: 'match', count: matchable.length, skipped, recordIds: parsedIds.slice(0, 50) },
    });

    bustCaches();
    const message = skipped > 0
      ? `${matchable.length} record(s) marked as matched, ${skipped} skipped for having no system quantity`
      : `${matchable.length} record(s) marked as matched`;
    res.json({ updated: matchable.length, skipped, message });
  } catch (error) { next(error); }
}

// """ Export audit log to Excel """"""""""""""""""""""""""""""""""""""""""""""""
