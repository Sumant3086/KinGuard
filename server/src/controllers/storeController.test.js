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

  // The admin's upload may leave the system quantity column blank on purpose so the
  // store supplies it. The store can therefore write it — but only while the record is
  // still open, since it is the baseline its own count is measured against.
  describe('updateInventoryRecord, system quantity', () => {
    const openRecord = (over = {}) => ({
      id: 77, systemQuantity: null, physicalQuantity: null, status: 'PENDING',
      batchId: 1, batch: { submissionDeadline: FUTURE, deadlineExtensions: [] }, ...over,
    });

    it('lets the store fill in a blank system quantity', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord());
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });

      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { systemQuantity: 12 },
      });

      expect(err).toBeNull();
      expect(prismaMock.inventoryRecord.update.mock.calls[0][0].data)
        .toMatchObject({ systemQuantity: 12 });
    });

    it('recomputes the difference when only the system quantity changes', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord({ physicalQuantity: 8 }));
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });

      await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { systemQuantity: 10 },
      });

      expect(prismaMock.inventoryRecord.update.mock.calls[0][0].data.difference).toBe(-2);
    });

    it('leaves the difference unknown while the system quantity is still blank', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord());
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });

      await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { physicalQuantity: 8 },
      });

      // Not 8, and not 0 — there is nothing to measure against yet.
      expect(prismaMock.inventoryRecord.update.mock.calls[0][0].data.difference).toBeNull();
    });

    it('accepts a genuine zero as a system quantity', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord({ physicalQuantity: 3 }));
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });

      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { systemQuantity: 0 },
      });

      expect(err).toBeNull();
      const data = prismaMock.inventoryRecord.update.mock.calls[0][0].data;
      expect(data.systemQuantity).toBe(0);
      expect(data.difference).toBe(3);
    });

    it('lets the store clear the system quantity back to blank', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord({ systemQuantity: 10, physicalQuantity: 8 }));
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });

      await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { systemQuantity: '' },
      });

      const data = prismaMock.inventoryRecord.update.mock.calls[0][0].data;
      expect(data.systemQuantity).toBeNull();
      expect(data.difference).toBeNull();
    });

    it('rejects a negative system quantity', async () => {
      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { systemQuantity: -1 },
      });

      expect(err?.statusCode).toBe(400);
      expect(prismaMock.inventoryRecord.findFirst).not.toHaveBeenCalled();
    });

    it('leaves the system quantity untouched when the field is not sent', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord({ systemQuantity: 10 }));
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });

      await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { remarks: 'note only' },
      });

      expect(prismaMock.inventoryRecord.update.mock.calls[0][0].data.systemQuantity).toBeUndefined();
    });

    it('locks the system quantity once the record is submitted', async () => {
      // This is the audited baseline; after submission the store must not be able to
      // move the number its own count was measured against.
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord({ status: 'SUBMITTED' }));

      const { err } = await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { systemQuantity: 99 },
      });

      expect(err?.statusCode).toBe(403);
      expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
    });

    it('records the previous system quantity in the audit log when the store changes it', async () => {
      prismaMock.inventoryRecord.findFirst.mockResolvedValue(openRecord({ systemQuantity: 10 }));
      prismaMock.inventoryRecord.update.mockResolvedValue({ id: 77 });
      const { createAuditLog } = await import('../services/auditService.js');
      createAuditLog.mockClear();

      await callAndCatch(store.updateInventoryRecord, {
        user: MANAGER, params: { id: '77' }, body: { systemQuantity: 4 },
      });

      expect(createAuditLog.mock.calls[0][0].metadata)
        .toMatchObject({ previousSystemQuantity: 10, systemQuantity: 4 });
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

    it('refuses to submit while any item still has a blank system quantity', async () => {
      prismaMock.uploadBatch.findFirst.mockResolvedValue({
        submissionDeadline: FUTURE, deadlineExtensions: [],
      });
      // Run the callback the controller passes to $transaction against a stub tx.
      const tx = {
        inventoryRecord: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, physicalQuantity: 5, systemQuantity: 5, difference: 0 },
            { id: 2, physicalQuantity: 3, systemQuantity: null, difference: null },
          ]),
          updateMany: vi.fn(),
        },
      };
      prismaMock.$transaction.mockImplementation(async (fn) => fn(tx));

      const { err } = await callAndCatch(store.submitInventory, {
        user: MANAGER, body: { batchId: '1' },
      });

      expect(err?.statusCode).toBe(400);
      expect(err?.message).toMatch(/system quantity/i);
      expect(tx.inventoryRecord.updateMany).not.toHaveBeenCalled();
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
