// The store manager's whole path through a cycle, run against a real database.
//
// The unit tests for this controller mock prisma, so they assert what the controller
// asks for but never what PostgreSQL gives back. Everything below is about the gap
// between those two: aggregate SQL that has to return the right numbers, and the
// blank-vs-zero distinction that only survives if the column is genuinely nullable.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  prisma, resetDb, clearCaches, run, runExpectingError,
  makeUser, makeStore, makeBatch, makeRecords, storeReq,
} from './helpers.js';
import {
  getDashboard, getBatches, getInventory, updateInventoryRecord, submitInventory,
} from '../../src/controllers/storeController.js';

const DAY = 24 * 60 * 60 * 1000;

let admin, store, manager, batch;

// createAuditLog is deliberately fire-and-forget, so a test that asserts on the trail
// has to give the insert a moment to land rather than assume it already has.
async function waitForAuditLog(action, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const log = await prisma.auditLog.findFirst({ where: { action } });
    if (log) return log;
    if (Date.now() > deadline) return null;
    await new Promise(r => setTimeout(r, 50));
  }
}

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });

beforeEach(async () => {
  await resetDb();
  admin   = await makeUser({ role: 'ADMIN', name: 'Admin' });
  store   = await makeStore({ storeCode: 'ST001', storeName: 'Gombe' });
  manager = await makeUser({ role: 'STORE_MANAGER', storeId: store.id, name: 'Manager' });
  batch   = await makeBatch(admin.id);
  clearCaches();
});

describe('getDashboard', () => {
  it('counts matched, shortage and excess from submitted rows only', async () => {
    await makeRecords(batch.id, store.id, [
      { code: 'A', sys: 10, phys: 10, status: 'SUBMITTED' },                                    // matched
      { code: 'B', sys: 10, phys: 7,  status: 'SUBMITTED', category: 'Theft', remarks: 'x' },   // shortage
      { code: 'C', sys: 10, phys: 13, status: 'SUBMITTED', category: 'Supplier', remarks: 'x' },// excess
      { code: 'D', sys: 10, phys: null },                                                       // still pending
    ]);

    const body = await run(getDashboard, storeReq(manager, store));

    expect(body.stats).toMatchObject({
      totalItems: 4, pendingItems: 1, submittedItems: 3,
      matchedItems: 1, shortageItems: 1, excessItems: 1,
    });
  });

  it('reports a blank system quantity as neither matched nor discrepant', async () => {
    // difference is null when either side is blank, and every CASE in the stats query
    // compares difference against a number — null must fall through all of them. If it
    // ever counted as matched, an uncounted baseline would look like a clean store.
    await makeRecords(batch.id, store.id, [
      { code: 'A', sys: null, phys: 5, status: 'SUBMITTED' },
      { code: 'B', sys: 10, phys: 10, status: 'SUBMITTED' },
    ]);

    const body = await run(getDashboard, storeReq(manager, store));

    expect(body.stats.submittedItems).toBe(2);
    expect(body.stats.matchedItems).toBe(1);
    expect(body.stats.shortageItems).toBe(0);
    expect(body.stats.excessItems).toBe(0);
  });

  it('reports a per-store extension as this store\'s deadline', async () => {
    const extended = new Date(Date.now() + 20 * DAY);
    const withDeadline = await makeBatch(admin.id, {
      inventoryDate: new Date(Date.now() + DAY),
      submissionDeadline: new Date(Date.now() + 5 * DAY),
    });
    await makeRecords(withDeadline.id, store.id, [{ code: 'A' }]);
    await prisma.batchDeadlineExtension.create({
      data: { batchId: withDeadline.id, storeId: store.id, newDeadline: extended, grantedBy: admin.id },
    });
    clearCaches();

    const body = await run(getDashboard, storeReq(manager, store));

    expect(new Date(body.batch.submissionDeadline).toISOString()).toBe(extended.toISOString());
    // The extension must not leak into the response as its own field.
    expect(body.batch.deadlineExtensions).toBeUndefined();
  });

  it('leaves out cycles the admin deleted', async () => {
    const deleted = await makeBatch(admin.id, { inventoryDate: new Date('2026-09-01T00:00:00Z'), isDeleted: true });
    await makeRecords(deleted.id, store.id, [{ code: 'X' }]);
    await makeRecords(batch.id, store.id, [{ code: 'A' }]);
    clearCaches();

    const body = await run(getDashboard, storeReq(manager, store));

    // The deleted cycle is newer, so a missing isDeleted filter surfaces it here.
    expect(body.batch.id).toBe(batch.id);
  });
});

describe('getBatches', () => {
  it('aggregates counts per cycle and excludes other stores', async () => {
    const otherStore = await makeStore({ storeCode: 'ST002' });
    await makeRecords(batch.id, store.id, [
      { code: 'A', status: 'SUBMITTED', phys: 100 },
      { code: 'B' },
      { code: 'C' },
    ]);
    await makeRecords(batch.id, otherStore.id, [{ code: 'A' }, { code: 'B' }]);

    const rows = await run(getBatches, storeReq(manager, store));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: batch.id, totalRecords: 3, pendingCount: 2, submittedCount: 1 });
  });

  it('omits a cycle this store has no rows in', async () => {
    const otherStore = await makeStore({ storeCode: 'ST003' });
    const otherBatch = await makeBatch(admin.id, { inventoryDate: new Date('2026-06-01T00:00:00Z') });
    await makeRecords(otherBatch.id, otherStore.id, [{ code: 'A' }]);
    await makeRecords(batch.id, store.id, [{ code: 'A' }]);

    const rows = await run(getBatches, storeReq(manager, store));

    expect(rows.map(r => r.id)).toEqual([batch.id]);
  });
});

describe('getInventory readiness', () => {
  it('returns readiness for the whole cycle, not just the page', async () => {
    await makeRecords(batch.id, store.id, [
      { code: 'A', sys: null, phys: null },
      { code: 'B', sys: 10,   phys: null },
      { code: 'C', sys: 10,   phys: 4 },                                 // discrepancy, no category, no detail
      { code: 'D', sys: 10,   phys: 4, category: 'Theft' },              // discrepancy, no detail
      { code: 'E', sys: 10,   phys: 10 },                                // clean
    ]);

    const req = storeReq(manager, store);
    req.query = { batchId: String(batch.id), page: '1', pageSize: '2' };

    const body = await run(getInventory, req);

    // The controller swallows an SQL error here and returns null, so a broken query
    // would look like a UI with no pre-submit warnings rather than a failure.
    expect(body.readiness).not.toBeNull();
    expect(body.readiness).toMatchObject({
      totalPending: 5, missingPhysical: 2, missingSystem: 1,
      missingCategory: 1, missingDetail: 2,
    });
    expect(body.records).toHaveLength(2);
    expect(body.pagination).toMatchObject({ totalRecords: 5, totalPages: 3 });
  });

  it('surfaces the area manager\'s return message', async () => {
    const am = await makeUser({ role: 'AREA_MANAGER' });
    await makeRecords(batch.id, store.id, [{ code: 'A' }]);
    await prisma.areaManagerReview.create({
      data: { batchId: batch.id, storeId: store.id, areaManagerId: am.id, status: 'RETURNED', remarks: 'Recount the whisky aisle' },
    });

    const req = storeReq(manager, store);
    req.query = { batchId: String(batch.id) };

    const body = await run(getInventory, req);

    expect(body.returnedByAM).toBe('Recount the whisky aisle');
  });

  it('matches on a partial item name regardless of case', async () => {
    await makeRecords(batch.id, store.id, [
      { code: 'A', name: 'Primus Beer 500ml' },
      { code: 'B', name: 'Coca-Cola 1L' },
    ]);

    const req = storeReq(manager, store);
    req.query = { batchId: String(batch.id), search: 'primus' };

    const body = await run(getInventory, req);

    expect(body.records).toHaveLength(1);
    expect(body.records[0].materialName).toBe('Primus Beer 500ml');
  });
});

describe('updateInventoryRecord', () => {
  it('lets the store supply a blank baseline and recomputes the variance', async () => {
    const [record] = await makeRecords(batch.id, store.id, [{ code: 'A', sys: null, phys: 8 }]);
    expect(record.difference).toBeNull();

    const req = storeReq(manager, store);
    req.params = { id: String(record.id) };
    req.body = { systemQuantity: 10 };

    const body = await run(updateInventoryRecord, req);

    expect(body.systemQuantity).toBe(10);
    expect(body.physicalQuantity).toBe(8);
    expect(body.difference).toBe(-2);
  });

  it('blanks the variance again when the baseline is cleared', async () => {
    const [record] = await makeRecords(batch.id, store.id, [{ code: 'A', sys: 10, phys: 8 }]);

    const req = storeReq(manager, store);
    req.params = { id: String(record.id) };
    req.body = { systemQuantity: '' };

    const body = await run(updateInventoryRecord, req);

    expect(body.systemQuantity).toBeNull();
    expect(body.difference).toBeNull();
  });

  it('keeps an explicit zero as a real figure', async () => {
    const [record] = await makeRecords(batch.id, store.id, [{ code: 'A', sys: null, phys: 3 }]);

    const req = storeReq(manager, store);
    req.params = { id: String(record.id) };
    req.body = { systemQuantity: 0 };

    const body = await run(updateInventoryRecord, req);

    expect(body.systemQuantity).toBe(0);
    expect(body.difference).toBe(3);
  });

  it('records the previous baseline in the audit trail', async () => {
    const [record] = await makeRecords(batch.id, store.id, [{ code: 'A', sys: 10, phys: 8 }]);

    const req = storeReq(manager, store);
    req.params = { id: String(record.id) };
    req.body = { systemQuantity: 12 };
    await run(updateInventoryRecord, req);

    const log = await waitForAuditLog('UPDATE_INVENTORY');

    expect(log).not.toBeNull();
    expect(log.metadata).toMatchObject({ previousSystemQuantity: 10, systemQuantity: 12 });
  });

  it('refuses to touch a submitted record', async () => {
    const [record] = await makeRecords(batch.id, store.id, [{ code: 'A', sys: 10, phys: 8, status: 'SUBMITTED' }]);

    const req = storeReq(manager, store);
    req.params = { id: String(record.id) };
    req.body = { systemQuantity: 999 };

    const err = await runExpectingError(updateInventoryRecord, req);

    expect(err.statusCode).toBe(403);
    const after = await prisma.inventoryRecord.findUnique({ where: { id: record.id } });
    expect(after.systemQuantity).toBe(10);
  });

  it('refuses a record belonging to another store', async () => {
    const otherStore = await makeStore({ storeCode: 'ST009' });
    const [record] = await makeRecords(batch.id, otherStore.id, [{ code: 'A' }]);

    const req = storeReq(manager, store);
    req.params = { id: String(record.id) };
    req.body = { physicalQuantity: 5 };

    const err = await runExpectingError(updateInventoryRecord, req);

    expect(err.statusCode).toBe(404);
  });
});

describe('submitInventory', () => {
  it('refuses to lock in a record with a blank baseline', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBatch = await makeBatch(admin.id, { inventoryDate: today });
    await makeRecords(todayBatch.id, store.id, [
      { code: 'A', sys: 10,   phys: 10 },
      { code: 'B', sys: null, phys: 5 },
    ]);

    const req = storeReq(manager, store);
    req.body = { batchId: todayBatch.id };

    const err = await runExpectingError(submitInventory, req);

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/missing a system quantity/i);
    // The transaction must have rolled back — nothing submitted.
    expect(await prisma.inventoryRecord.count({ where: { status: 'SUBMITTED' } })).toBe(0);
  });

  it('refuses when a physical count is missing', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBatch = await makeBatch(admin.id, { inventoryDate: today });
    await makeRecords(todayBatch.id, store.id, [{ code: 'A', sys: 10, phys: null }]);

    const req = storeReq(manager, store);
    req.body = { batchId: todayBatch.id };

    const err = await runExpectingError(submitInventory, req);

    expect(err.message).toMatch(/missing a physical count/i);
  });

  it('allows submission of discrepancy without category (now optional)', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBatch = await makeBatch(admin.id, { inventoryDate: today });
    await makeRecords(todayBatch.id, store.id, [{ code: 'A', sys: 10, phys: 4 }]);

    const req = storeReq(manager, store);
    req.body = { batchId: todayBatch.id };

    // Should succeed - category is now optional
    const body = await run(submitInventory, req);
    
    expect(body.recordCount).toBe(1);
    const record = await prisma.inventoryRecord.findFirst({ where: { batchId: todayBatch.id } });
    expect(record.status).toBe('SUBMITTED');
    expect(record.shrinkageCategory).toBeNull(); // No category provided
  });

  it('submits a complete cycle and freezes both quantities', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBatch = await makeBatch(admin.id, { inventoryDate: today });
    await makeRecords(todayBatch.id, store.id, [
      { code: 'A', sys: 10, phys: 10 },
      { code: 'B', sys: 10, phys: 6, category: 'Theft', remarks: 'Missing from aisle 3' },
    ]);

    const req = storeReq(manager, store);
    req.body = { batchId: todayBatch.id };

    const body = await run(submitInventory, req);

    expect(body.recordCount).toBe(2);
    const rows = await prisma.inventoryRecord.findMany({ where: { batchId: todayBatch.id }, orderBy: { materialCode: 'asc' } });
    expect(rows.every(r => r.status === 'SUBMITTED')).toBe(true);
    expect(rows.every(r => r.submittedBy === manager.id)).toBe(true);
    expect(rows.every(r => r.submittedAt !== null)).toBe(true);

    // Frozen means frozen: the store cannot move the baseline it was measured against.
    const edit = storeReq(manager, store);
    edit.params = { id: String(rows[1].id) };
    edit.body = { systemQuantity: 6 };
    const err = await runExpectingError(updateInventoryRecord, edit);
    expect(err.statusCode).toBe(403);
  });

  it('opens an area manager review when the store has one assigned', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBatch = await makeBatch(admin.id, { inventoryDate: today });
    const am = await makeUser({ role: 'AREA_MANAGER' });
    await prisma.store.update({ where: { id: store.id }, data: { areaManagerId: am.id } });
    await makeRecords(todayBatch.id, store.id, [{ code: 'A', sys: 10, phys: 10 }]);

    const req = storeReq(manager, store);
    req.body = { batchId: todayBatch.id };
    await run(submitInventory, req);

    const review = await prisma.areaManagerReview.findUnique({
      where: { batchId_storeId: { batchId: todayBatch.id, storeId: store.id } },
    });
    expect(review).toMatchObject({ status: 'PENDING_REVIEW', areaManagerId: am.id });
  });

  it('refuses to submit into a cycle the admin deleted', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBatch = await makeBatch(admin.id, { inventoryDate: today });
    await makeRecords(todayBatch.id, store.id, [{ code: 'A', sys: 10, phys: 10 }]);
    await prisma.uploadBatch.update({ where: { id: todayBatch.id }, data: { isDeleted: true } });

    const req = storeReq(manager, store);
    req.body = { batchId: todayBatch.id };

    const err = await runExpectingError(submitInventory, req);

    expect(err.statusCode).toBe(404);
  });

  it('refuses to submit after the deadline has passed', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const past = await makeBatch(admin.id, {
      inventoryDate: today,
      submissionDeadline: new Date(Date.now() - 2 * DAY),
    });
    await makeRecords(past.id, store.id, [{ code: 'A', sys: 10, phys: 10 }]);

    const req = storeReq(manager, store);
    req.body = { batchId: past.id };

    const err = await runExpectingError(submitInventory, req);

    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/deadline has passed/i);
  });
});
