// Tenancy and cycle-state boundary tests for the store manager routes.
//
// A store manager's identity carries their storeId, so every read and write has to be
// scoped to it in the query itself rather than checked afterwards. These tests assert
// the scoping is present in the `where` clause that goes to the database — that is the
// only place it can be enforced, and a missing storeId there would expose the whole
// network's counts rather than fail loudly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  inventoryRecord: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  uploadBatch: { findFirst: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $connect: vi.fn(),
};
vi.mock('../config/prisma.js', () => ({ default: prismaMock }));
vi.mock('../services/auditService.js', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/serverCache.js', () => ({ sGet: () => undefined, sSet: () => {}, sInvalidate: () => {} }));

const store = await import('./storeController.js');

const MANAGER = { id: 5, role: 'STORE_MANAGER', storeId: 3 };

async function callAndCatch(handler, req) {
  const next = vi.fn();
  const res = { json: vi.fn() };
  await handler(req, res, next);
  return { err: next.mock.calls[0]?.[0] ?? null, res };
}

/** A deadline safely in the future, so deadline checks never mask the case under test. */
const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

describe('store manager record scoping', () => {
  beforeEach(() => {
    Object.values(prismaMock).forEach((v) => {
      if (typeof v.mockReset === 'function') v.mockReset();
      else Object.values(v).forEach((f) => f.mockReset());
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('updateInventoryRecord', () => {
    it('scopes the record lookup to the caller\'s own store', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(null);

      await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: 5 },
      });

      // Without storeId here, any manager could edit any store's record by guessing ids.
      expect(prismaMock.inventoryRecord.findFirst.mock.calls[0][0].where)
        .toMatchObject({ id: 77, storeId: MANAGER.storeId });
    });

    it('excludes deleted cycles from the record lookup', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(null);

      await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: 5 },
      });

      expect(prismaMock.inventoryRecord.findFirst.mock.calls[0][0].where)
        .toMatchObject({ batch: { isDeleted: false } });
    });

    it('returns 404 for a record outside the caller\'s store', async () => {
      // The scoped query simply finds nothing.
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(null);

      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: 5 },
      });

      expect(err?.statusCode).toBe(404);
      expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
    });

    it('refuses to edit a record that has already been submitted', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue({
        id: 77, systemQuantity: 10, physicalQuantity: 10, status: 'SUBMITTED',
        batchId: 1, batch: { submissionDeadline: FUTURE, deadlineExtensions: [] },
      });

      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: 5 },
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
    });

    it('refuses to edit once the submission deadline has passed', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue({
        id: 77, systemQuantity: 10, physicalQuantity: null, status: 'PENDING',
        batchId: 1, batch: { submissionDeadline: PAST, deadlineExtensions: [] },
      });

      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: 5 },
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
    });

    it('allows an edit past the batch deadline when this store holds an extension', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue({
        id: 77, systemQuantity: 10, physicalQuantity: null, status: 'PENDING',
        batchId: 1,
        batch: { submissionDeadline: PAST, deadlineExtensions: [{ newDeadline: FUTURE }] },
      });
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });

      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: 5 },
      });

      expect(err).toBeNull();
      expect(prismaMock.inventoryRecord.update).toHaveBeenCalled();
    });

    it('rejects a negative physical count', async () => {
      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: -1 },
      });

      expect(err?.statusCode).toBe(400);
      expect(prismaMock.inventoryRecord.findFirst).not.toHaveBeenCalled();
    });

    it('rejects an unrecognised shrinkage category', async () => {
      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' },
        body: { physicalQuantity: 5, shrinkageCategory: 'NOT_A_REAL_CATEGORY' },
      });

      expect(err?.statusCode).toBe(400);
    });
  });

  describe('submitInventory', () => {
    it('refuses to submit into a deleted cycle', async () => {
      // Scoped by isDeleted: false, so a cycle the admin removed is simply not found.
      prismaMock.uploadBatch.findFirst.mockResolvedValue(null);

      const { err } = await callAndCatch(store.submitInventory, {
        user: MANAGER, body: { batchId: '1' },
      });

      expect(err?.statusCode).toBe(404);
      expect(prismaMock.uploadBatch.findFirst.mock.calls[0][0].where)
        .toMatchObject({ isDeleted: false });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to submit after the deadline has passed', async () => {
      prismaMock.uploadBatch.findFirst.mockResolvedValue({
        submissionDeadline: PAST, deadlineExtensions: [],
      });

      const { err } = await callAndCatch(store.submitInventory, {
        user: MANAGER, body: { batchId: '1' },
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('scopes the deadline extension lookup to the caller\'s own store', async () => {
      prismaMock.uploadBatch.findFirst.mockResolvedValue(null);

      await callAndCatch(store.submitInventory, { user: MANAGER, body: { batchId: '1' } });

      // Reading another store's extension would let this store submit late.
      expect(prismaMock.uploadBatch.findFirst.mock.calls[0][0].select.deadlineExtensions.where)
        .toMatchObject({ storeId: MANAGER.storeId });
    });
  });
});
