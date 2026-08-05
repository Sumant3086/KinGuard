// The admin dashboard and the analytics endpoints are almost entirely raw SQL:
// per-store aggregates, a multi-cycle hotspot query with a HAVING clause, and risk
// scores built from two separate GROUP BY passes. None of that is exercised by the
// mocked unit tests, which only ever see whatever array the mock was told to return.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  prisma, resetDb, clearCaches, run, runExpectingError,
  makeUser, makeStore, makeBatch, makeRecords,
} from './helpers.js';
import { getDashboard } from '../../src/controllers/adminController.js';
import { getRiskScores, getTrendsYoY } from '../../src/controllers/analyticsController.js';
import { grantStoreExtension } from '../../src/controllers/admin/batches.js';

const DAY = 24 * 60 * 60 * 1000;

let admin, storeA, storeB;

const adminReq = (query = {}, body = {}) => ({ user: { id: admin.id, role: 'ADMIN', name: 'Admin' }, params: {}, query, body });

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });

beforeEach(async () => {
  await resetDb();
  admin  = await makeUser({ role: 'ADMIN', name: 'Admin' });
  storeA = await makeStore({ storeCode: 'ST001', storeName: 'Gombe' });
  storeB = await makeStore({ storeCode: 'ST002', storeName: 'Limete' });
  clearCaches();
});

describe('admin dashboard', () => {
  it('returns an empty shape when no cycle has completed', async () => {
    const body = await run(getDashboard, adminReq());

    expect(body.currentBatch).toBeNull();
    expect(body.totalStores).toBe(2);
    expect(body.storeScorecard).toEqual([]);
    expect(body.networkSummary).toEqual({ totalRecords: 0, matchedItems: 0, shortageItems: 0, excessItems: 0 });
  });

  it('scores each store on what it counted, not on what it was assigned', async () => {
    const batch = await makeBatch(admin.id);
    // Gombe counted 4 of 10 items and 2 of those were short — 50%, not 20%.
    await makeRecords(batch.id, storeA.id, [
      { code: 'A', sys: 10, phys: 6, status: 'SUBMITTED', category: 'Theft', remarks: 'gone' },
      { code: 'B', sys: 10, phys: 8, status: 'SUBMITTED', category: 'Theft', remarks: 'gone' },
      { code: 'C', sys: 10, phys: 10, status: 'SUBMITTED' },
      { code: 'D', sys: 10, phys: 12, status: 'SUBMITTED', category: 'Supplier', remarks: 'extra' },
      { code: 'E' }, { code: 'F' }, { code: 'G' }, { code: 'H' }, { code: 'I' }, { code: 'J' },
    ]);
    await makeRecords(batch.id, storeB.id, [{ code: 'A', sys: 5, phys: 5, status: 'SUBMITTED' }]);
    clearCaches();

    const body = await run(getDashboard, adminReq());

    const gombe = body.storeScorecard.find(s => s.storeCode === 'ST001');
    expect(gombe).toMatchObject({
      totalItems: 10, shortageCount: 2, matchedCount: 1, excessCount: 1,
      shortageRate: 50, status: 'PENDING', riskLevel: 'RED',
    });
    expect(gombe.topRemark).toBe('gone');

    const limete = body.storeScorecard.find(s => s.storeCode === 'ST002');
    expect(limete).toMatchObject({ shortageRate: 0, status: 'SUBMITTED', riskLevel: 'GREEN' });

    expect(body.networkSummary).toEqual({ totalRecords: 11, matchedItems: 2, shortageItems: 2, excessItems: 1 });
    expect(body.currentBatch).toMatchObject({ storesPending: 1, storesSubmitted: 1 });
  });

  it('shows a store with no rows in the cycle as NO_DATA rather than dropping it', async () => {
    const batch = await makeBatch(admin.id);
    await makeRecords(batch.id, storeA.id, [{ code: 'A', sys: 1, phys: 1, status: 'SUBMITTED' }]);
    clearCaches();

    const body = await run(getDashboard, adminReq());

    expect(body.storeScorecard).toHaveLength(2);
    expect(body.storeScorecard.find(s => s.storeCode === 'ST002')).toMatchObject({ status: 'NO_DATA', totalItems: 0 });
  });

  it('flags an item short in two of the last four cycles as a hotspot', async () => {
    const older  = await makeBatch(admin.id, { inventoryDate: new Date('2026-05-01T00:00:00Z') });
    const newer  = await makeBatch(admin.id, { inventoryDate: new Date('2026-06-01T00:00:00Z') });
    const latest = await makeBatch(admin.id, { inventoryDate: new Date('2026-07-01T00:00:00Z') });

    for (const b of [older, newer, latest]) {
      await makeRecords(b.id, storeA.id, [
        { code: 'WHISKY', name: 'Whisky 700ml', sys: 20, phys: 15, status: 'SUBMITTED', category: 'Theft', remarks: 'short' },
        { code: 'RICE',   name: 'Rice 5kg',     sys: 20, phys: 20, status: 'SUBMITTED' },
      ]);
    }
    clearCaches();

    const body = await run(getDashboard, adminReq());

    expect(body.hotspots).toHaveLength(1);
    expect(body.hotspots[0]).toMatchObject({
      storeCode: 'ST001', materialCode: 'WHISKY', batchCount: 3, totalShortage: 15,
    });
  });

  it('ignores deleted and unfinished cycles when picking the current one', async () => {
    const good    = await makeBatch(admin.id, { inventoryDate: new Date('2026-06-01T00:00:00Z') });
    const deleted = await makeBatch(admin.id, { inventoryDate: new Date('2026-07-01T00:00:00Z'), isDeleted: true });
    const partial = await makeBatch(admin.id, { inventoryDate: new Date('2026-08-01T00:00:00Z'), status: 'PENDING' });
    await makeRecords(good.id,    storeA.id, [{ code: 'A', sys: 1, phys: 1, status: 'SUBMITTED' }]);
    await makeRecords(deleted.id, storeA.id, [{ code: 'A', sys: 1, phys: 0, status: 'SUBMITTED' }]);
    await makeRecords(partial.id, storeA.id, [{ code: 'A', sys: 1, phys: 0, status: 'SUBMITTED' }]);
    clearCaches();

    const body = await run(getDashboard, adminReq());

    expect(body.currentBatch.id).toBe(good.id);
    expect(body.networkSummary.shortageItems).toBe(0);
  });

  it('lists the area manager review pipeline for the current cycle', async () => {
    const am = await makeUser({ role: 'AREA_MANAGER', name: 'Area Manager' });
    const batch = await makeBatch(admin.id);
    await makeRecords(batch.id, storeA.id, [{ code: 'A', sys: 1, phys: 1, status: 'SUBMITTED' }]);
    await prisma.areaManagerReview.create({
      data: { batchId: batch.id, storeId: storeA.id, areaManagerId: am.id, status: 'PENDING_REVIEW' },
    });
    clearCaches();

    const body = await run(getDashboard, adminReq());

    expect(body.amReviewPipeline).toEqual([
      { status: 'PENDING_REVIEW', storeId: storeA.id, storeCode: 'ST001', storeName: 'Gombe' },
    ]);
  });

  it('serves the cached copy until a bust is requested', async () => {
    const batch = await makeBatch(admin.id);
    await makeRecords(batch.id, storeA.id, [{ code: 'A', sys: 10, phys: 10, status: 'SUBMITTED' }]);
    clearCaches();

    const first = await run(getDashboard, adminReq());
    expect(first.networkSummary.totalRecords).toBe(1);

    await makeRecords(batch.id, storeB.id, [{ code: 'A', sys: 10, phys: 4, status: 'SUBMITTED', category: 'Theft', remarks: 'x' }]);

    const stale = await run(getDashboard, adminReq());
    expect(stale.networkSummary.totalRecords).toBe(1);

    const fresh = await run(getDashboard, adminReq({ _bust: '1' }));
    expect(fresh.networkSummary.totalRecords).toBe(2);
    expect(fresh.networkSummary.shortageItems).toBe(1);
  });
});

describe('risk scores', () => {
  it('returns nothing when there is no completed cycle', async () => {
    const body = await run(getRiskScores, adminReq());
    expect(body).toEqual({ stores: [], skus: [], cycles: 0 });
  });

  it('raises the score for a store whose shortage rate is climbing', async () => {
    const prior  = await makeBatch(admin.id, { inventoryDate: new Date('2026-06-01T00:00:00Z') });
    const latest = await makeBatch(admin.id, { inventoryDate: new Date('2026-07-01T00:00:00Z') });

    // Gombe: 1 shortage in 4 last cycle, 3 in 4 now, and the reason is theft.
    await makeRecords(prior.id, storeA.id, [
      { code: 'A', sys: 10, phys: 9, status: 'SUBMITTED', category: 'Theft', remarks: 'x' },
      { code: 'B', sys: 10, phys: 10, status: 'SUBMITTED' },
      { code: 'C', sys: 10, phys: 10, status: 'SUBMITTED' },
      { code: 'D', sys: 10, phys: 10, status: 'SUBMITTED' },
    ]);
    await makeRecords(latest.id, storeA.id, [
      { code: 'A', sys: 10, phys: 5, status: 'SUBMITTED', category: 'Theft', remarks: 'x' },
      { code: 'B', sys: 10, phys: 5, status: 'SUBMITTED', category: 'Theft', remarks: 'x', isRepeat: true },
      { code: 'C', sys: 10, phys: 5, status: 'SUBMITTED', category: 'Theft', remarks: 'x' },
      { code: 'D', sys: 10, phys: 10, status: 'SUBMITTED' },
    ]);
    // Limete stays clean in both cycles.
    await makeRecords(prior.id,  storeB.id, [{ code: 'A', sys: 10, phys: 10, status: 'SUBMITTED' }]);
    await makeRecords(latest.id, storeB.id, [{ code: 'A', sys: 10, phys: 10, status: 'SUBMITTED' }]);
    clearCaches();

    const body = await run(getRiskScores, adminReq());

    const gombe = body.stores.find(s => s.storeCode === 'ST001');
    const limete = body.stores.find(s => s.storeCode === 'ST002');

    expect(gombe).toMatchObject({ shortageRate: 75, topCategory: 'Theft', trend: 'up' });
    expect(gombe.repeatRate).toBe(33); // 1 repeat out of 3 shortages
    expect(gombe.riskScore).toBeGreaterThan(limete.riskScore);
    expect(limete).toMatchObject({ shortageRate: 0, riskScore: 0, trend: 'flat' });
    expect(body.latestBatchId).toBe(latest.id);
  });
});

describe('year-on-year trends', () => {
  it('rejects a missing comparison year', async () => {
    const err = await runExpectingError(getTrendsYoY, adminReq());
    expect(err.statusCode).toBe(400);
  });

  it('reports a shortage rate per cycle for both years', async () => {
    const lastYear = await makeBatch(admin.id, { inventoryDate: new Date('2025-07-01T00:00:00Z') });
    const thisYear = await makeBatch(admin.id, { inventoryDate: new Date('2026-07-01T00:00:00Z') });

    await makeRecords(lastYear.id, storeA.id, [
      { code: 'A', sys: 10, phys: 9, status: 'SUBMITTED', category: 'Theft', remarks: 'x' },
      { code: 'B', sys: 10, phys: 10, status: 'SUBMITTED' },
      { code: 'C', sys: 10, phys: 10, status: 'SUBMITTED' },
      { code: 'D', sys: 10, phys: 10, status: 'SUBMITTED' },
    ]);
    await makeRecords(thisYear.id, storeA.id, [
      { code: 'A', sys: 10, phys: 9, status: 'SUBMITTED', category: 'Theft', remarks: 'x' },
      { code: 'B', sys: 10, phys: 9, status: 'SUBMITTED', category: 'Theft', remarks: 'x' },
      { code: 'C', sys: 10, phys: 10, status: 'SUBMITTED' },
      { code: 'D', sys: 10, phys: 10, status: 'SUBMITTED' },
    ]);
    clearCaches();

    const body = await run(getTrendsYoY, adminReq({ compareYear: '2025' }));

    expect(body.current.rates.find(r => r.batchId === thisYear.id).rate).toBe(50);
    expect(body.comparison.rates.find(r => r.batchId === lastYear.id).rate).toBe(25);
  });
});

describe('deadline extensions', () => {
  it('keeps one extension per store per cycle: a second grant replaces the first rather than failing', async () => {
    const batch = await makeBatch(admin.id);
    const firstDeadline = new Date(Date.now() + DAY);
    const secondDeadline = new Date(Date.now() + 5 * DAY);

    await run(grantStoreExtension, adminReq({}, {
      batchId: batch.id, storeId: storeA.id, newDeadline: firstDeadline.toISOString(),
    }));
    await run(grantStoreExtension, adminReq({}, {
      batchId: batch.id, storeId: storeA.id, newDeadline: secondDeadline.toISOString(),
    }));

    const rows = await prisma.batchDeadlineExtension.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].newDeadline.toISOString()).toBe(secondDeadline.toISOString());
    expect(rows[0].grantedBy).toBe(admin.id);
  });
});
