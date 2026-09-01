// Tenancy boundary tests for the area manager routes.
//
// requireAreaManager only proves the caller is *an* area manager. It says nothing
// about *which* stores they manage, so every AM route that names a store has to check
// the assignment itself. These tests pin that check on each of those routes: without
// them, dropping one line silently lets any area manager read and approve counts for
// every store in the network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  store: { findMany: vi.fn(), findUnique: vi.fn() },
  inventoryRecord: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  areaManagerReview: { findUnique: vi.fn(), upsert: vi.fn() },
  uploadBatch: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $connect: vi.fn(),
  $transaction: vi.fn((ops) => Promise.all(ops)),
};
vi.mock('../config/prisma.js', () => ({ default: prismaMock }));
vi.mock('../services/auditService.js', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/emailService.js', () => ({
  sendAMApprovalEmail: vi.fn().mockResolvedValue({}),
  sendAMReturnEmail: vi.fn().mockResolvedValue({}),
}));

// Real cache would carry managed-store lists between tests.
const cache = new Map();
vi.mock('../services/serverCache.js', () => ({
  sGet: (k) => cache.get(k),
  sSet: (k, v) => cache.set(k, v),
  sInvalidate: (...keys) => keys.forEach((k) => cache.delete(k)),
}));

const am = await import('./areaManagerController.js');

const AM = { id: 10, role: 'AREA_MANAGER' };
const ASSIGNED_STORE = 3;
const OTHER_STORE = 99;

/** Call a controller and return the error it passed to next(), or null. */
async function callAndCatch(handler, req) {
  const next = vi.fn();
  const res = { json: vi.fn() };
  await handler(req, res, next);
  return { err: next.mock.calls[0]?.[0] ?? null, res };
}

describe('area manager store assignment', () => {
  beforeEach(() => {
    cache.clear();
    Object.values(prismaMock).forEach((v) => {
      if (typeof v.mockReset === 'function') v.mockReset();
      else Object.values(v).forEach((f) => f.mockReset());
    });
    // This AM manages exactly one store.
    prismaMock.store.findMany.mockResolvedValue([{ id: ASSIGNED_STORE }]);
    // Default to a live (non-deleted) batch so tests that don't care about the
    // isDeleted guard reach the code they're actually exercising.
    prismaMock.uploadBatch.findFirst.mockResolvedValue({ id: 1 });
    prismaMock.$transaction.mockImplementation((ops) => Promise.all(ops));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('getStoreRecords', () => {
    it('refuses to read a store this area manager does not manage', async () => {
      const { err } = await callAndCatch(am.getStoreRecords, {
        user: AM, params: { batchId: '1', storeId: String(OTHER_STORE) },
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.inventoryRecord.findMany).not.toHaveBeenCalled();
    });

    it('reads a store this area manager does manage', async () => {
      prismaMock.inventoryRecord.findMany.mockResolvedValue([]);
      prismaMock.areaManagerReview.findUnique.mockResolvedValue(null);
      prismaMock.store.findUnique.mockResolvedValue({ storeCode: 'S3', storeName: 'Three' });

      const { err } = await callAndCatch(am.getStoreRecords, {
        user: AM, params: { batchId: '1', storeId: String(ASSIGNED_STORE) },
      });

      expect(err).toBeNull();
      expect(prismaMock.inventoryRecord.findMany).toHaveBeenCalled();
    });

    it('excludes deleted cycles from what it returns', async () => {
      prismaMock.inventoryRecord.findMany.mockResolvedValue([]);
      prismaMock.areaManagerReview.findUnique.mockResolvedValue(null);
      prismaMock.store.findUnique.mockResolvedValue({});

      await callAndCatch(am.getStoreRecords, {
        user: AM, params: { batchId: '1', storeId: String(ASSIGNED_STORE) },
      });

      const where = prismaMock.inventoryRecord.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ storeId: ASSIGNED_STORE, batch: { isDeleted: false } });
    });
  });

  describe('approveStore', () => {
    it('refuses to approve a store this area manager does not manage', async () => {
      const { err } = await callAndCatch(am.approveStore, {
        user: AM, params: { batchId: '1', storeId: String(OTHER_STORE) }, body: {},
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.areaManagerReview.upsert).not.toHaveBeenCalled();
    });

    it('re-reads assignments from the database rather than trusting the cache', async () => {
      // A store reassigned away from this AM must be denied immediately, not up to
      // 60 seconds later when the cache expires.
      cache.set(`am:stores:${AM.id}`, [ASSIGNED_STORE, OTHER_STORE]);
      prismaMock.store.findMany.mockResolvedValue([{ id: ASSIGNED_STORE }]);

      const { err } = await callAndCatch(am.approveStore, {
        user: AM, params: { batchId: '1', storeId: String(OTHER_STORE) }, body: {},
      });

      expect(prismaMock.store.findMany).toHaveBeenCalled();
      expect(err?.statusCode).toBe(403);
    });

    it('refuses to approve while the store still has pending items', async () => {
      // The UI hides the button, but a direct API call must not bypass it.
      const today = new Date();
      prismaMock.uploadBatch.findFirst.mockResolvedValue({ 
        id: 1, 
        inventoryDate: today 
      });
      prismaMock.inventoryRecord.count.mockResolvedValue(4);

      const { err } = await callAndCatch(am.approveStore, {
        user: AM, params: { batchId: '1', storeId: String(ASSIGNED_STORE) }, body: {},
      });

      expect(err?.statusCode).toBe(400);
      expect(prismaMock.areaManagerReview.upsert).not.toHaveBeenCalled();
    });

    it('refuses to approve into a cycle the admin has deleted', async () => {
      // A review tab opened before the delete must not still be able to write an
      // approval into a cycle that no longer exists on every other screen.
      prismaMock.uploadBatch.findFirst.mockResolvedValue(null);

      const { err } = await callAndCatch(am.approveStore, {
        user: AM, params: { batchId: '1', storeId: String(ASSIGNED_STORE) }, body: {},
      });

      expect(err?.statusCode).toBe(404);
      expect(prismaMock.uploadBatch.findFirst.mock.calls[0][0].where).toMatchObject({ isDeleted: false });
      expect(prismaMock.inventoryRecord.count).not.toHaveBeenCalled();
      expect(prismaMock.areaManagerReview.upsert).not.toHaveBeenCalled();
    });
  });

  describe('returnStore', () => {
    it('refuses to return a store this area manager does not manage', async () => {
      const { err } = await callAndCatch(am.returnStore, {
        user: AM,
        params: { batchId: '1', storeId: String(OTHER_STORE) },
        body: { remarks: 'Please recount' },
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.areaManagerReview.upsert).not.toHaveBeenCalled();
    });

    it('refuses to return records into a cycle the admin has deleted', async () => {
      prismaMock.uploadBatch.findFirst.mockResolvedValue(null);

      const { err } = await callAndCatch(am.returnStore, {
        user: AM,
        params: { batchId: '1', storeId: String(ASSIGNED_STORE) },
        body: { remarks: 'Please recount' },
      });

      expect(err?.statusCode).toBe(404);
      expect(prismaMock.inventoryRecord.count).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateRecord', () => {
    it('refuses to edit a record belonging to an unmanaged store', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue({
        storeId: OTHER_STORE, batchId: 1, status: 'SUBMITTED', systemQuantity: 10,
      });

      const { err } = await callAndCatch(am.updateRecord, {
        user: AM, params: { id: '55' }, body: { physicalQuantity: 9 },
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
    });

    it('refuses to edit a record inside a deleted cycle', async () => {
      // The controller scopes the lookup to batch.isDeleted = false, so a record in a
      // deleted cycle simply is not found.
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(null);

      const { err } = await callAndCatch(am.updateRecord, {
        user: AM, params: { id: '55' }, body: { physicalQuantity: 9 },
      });

      expect(err?.statusCode).toBe(404);
      expect(prismaMock.inventoryRecord.findFirst.mock.calls[0][0].where)
        .toMatchObject({ batch: { isDeleted: false } });
      expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
    });

    it('refuses to edit a record the store has not submitted yet', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue({
        storeId: ASSIGNED_STORE, batchId: 1, status: 'PENDING', systemQuantity: 10,
      });

      const { err } = await callAndCatch(am.updateRecord, {
        user: AM, params: { id: '55' }, body: { physicalQuantity: 9 },
      });

      expect(err?.statusCode).toBe(400);
      expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
    });
  });
});
