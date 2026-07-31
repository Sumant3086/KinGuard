// Facts the database enforces, not the application. Every assertion here fails only if
// a migration is missing, wrong, or was never applied — which is exactly the class of
// bug the mocked unit tests cannot see.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, resetDb, makeUser, makeStore, makeBatch } from './helpers.js';

let admin, store, batch;

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  admin = await makeUser({ role: 'ADMIN', name: 'Admin' });
  store = await makeStore();
  batch = await makeBatch(admin.id);
});

describe('InventoryRecord', () => {
  it('stores a blank system quantity as null rather than 0', async () => {
    // The whole blank-vs-zero feature rests on this column being nullable. Before
    // migration 20260730000003 the insert below failed with a NOT NULL violation.
    const created = await prisma.inventoryRecord.create({
      data: { batchId: batch.id, storeId: store.id, materialCode: 'M1', materialName: 'Item', systemQuantity: null },
    });

    expect(created.systemQuantity).toBeNull();
    expect(created.physicalQuantity).toBeNull();
    expect(created.difference).toBeNull();

    const readBack = await prisma.inventoryRecord.findUnique({ where: { id: created.id } });
    expect(readBack.systemQuantity).toBeNull();
  });

  it('keeps an explicit 0 distinguishable from a blank', async () => {
    await prisma.inventoryRecord.createMany({
      data: [
        { batchId: batch.id, storeId: store.id, materialCode: 'ZERO', materialName: 'Zero', systemQuantity: 0 },
        { batchId: batch.id, storeId: store.id, materialCode: 'BLANK', materialName: 'Blank', systemQuantity: null },
      ],
    });

    const rows = await prisma.$queryRaw`
      SELECT "materialCode", "systemQuantity"
      FROM "InventoryRecord"
      WHERE "systemQuantity" IS NULL AND "batchId" = ${batch.id}
    `;

    // IS NULL must match only the blank. If the migration had defaulted blanks to 0
    // this returns nothing, and every "please fill this in" prompt in the UI goes quiet.
    expect(rows).toHaveLength(1);
    expect(rows[0].materialCode).toBe('BLANK');
  });

  it('refuses a second row for the same item in the same store and cycle', async () => {
    const row = { batchId: batch.id, storeId: store.id, materialCode: 'DUP', materialName: 'Item' };
    await prisma.inventoryRecord.create({ data: row });

    await expect(prisma.inventoryRecord.create({ data: row })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows the same item code in a different store', async () => {
    const other = await makeStore();
    await prisma.inventoryRecord.create({ data: { batchId: batch.id, storeId: store.id, materialCode: 'SAME', materialName: 'Item' } });
    await prisma.inventoryRecord.create({ data: { batchId: batch.id, storeId: other.id, materialCode: 'SAME', materialName: 'Item' } });

    expect(await prisma.inventoryRecord.count({ where: { materialCode: 'SAME' } })).toBe(2);
  });
});

describe('AuditLog immutability', () => {
  it('rejects a delete at the database level', async () => {
    const log = await prisma.auditLog.create({
      data: { userId: admin.id, action: 'LOGIN', entityType: 'USER', entityId: admin.id },
    });

    // No application path deletes audit rows, so this trigger is the only thing standing
    // between a compromised admin account and a clean-looking history.
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/cannot be deleted/i);
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it('rejects a bulk delete too', async () => {
    await prisma.auditLog.create({ data: { action: 'LOGIN' } });
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/cannot be deleted/i);
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it('survives the deletion of the user who caused it', async () => {
    const victim = await makeUser({ role: 'STORE_MANAGER' });
    await prisma.auditLog.create({ data: { userId: victim.id, action: 'UPDATE_INVENTORY' } });

    await prisma.user.delete({ where: { id: victim.id } });

    const remaining = await prisma.auditLog.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBeNull();
    expect(remaining[0].action).toBe('UPDATE_INVENTORY');
  });
});

describe('Cascade behaviour', () => {
  it('removes refresh tokens with their user', async () => {
    const user = await makeUser();
    await prisma.refreshToken.create({
      data: { token: 'tok-1', userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('refuses to delete a store that still holds inventory', async () => {
    await prisma.inventoryRecord.create({
      data: { batchId: batch.id, storeId: store.id, materialCode: 'M1', materialName: 'Item' },
    });

    // RESTRICT, not CASCADE — deleting a store must never silently take a cycle's
    // history with it.
    await expect(prisma.store.delete({ where: { id: store.id } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('removes an area manager review with its cycle', async () => {
    const am = await makeUser({ role: 'AREA_MANAGER' });
    await prisma.areaManagerReview.create({
      data: { batchId: batch.id, storeId: store.id, areaManagerId: am.id, status: 'PENDING_REVIEW' },
    });

    await prisma.uploadBatch.delete({ where: { id: batch.id } });

    expect(await prisma.areaManagerReview.count()).toBe(0);
  });
});

describe('Indexes the hot queries depend on', () => {
  // The migrations here are hand-written, so an index added to schema.prisma without a
  // matching migration produces a plan that only shows up as a slow dashboard in
  // production. These are the composite indexes the scorecard and report queries need.
  it.each([
    ['InventoryRecord', 'InventoryRecord_batchId_status_difference_idx'],
    ['InventoryRecord', 'InventoryRecord_storeId_batchId_idx'],
    ['InventoryRecord', 'InventoryRecord_storeId_status_idx'],
    ['UploadBatch', 'UploadBatch_status_isDeleted_inventoryDate_idx'],
    ['AreaManagerReview', 'AreaManagerReview_batchId_areaManagerId_status_idx'],
    ['CycleSchedule', 'CycleSchedule_isActive_nextRunAt_idx'],
  ])('%s has %s', async (table, indexName) => {
    const rows = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE tablename = ${table} AND indexname = ${indexName}
    `;
    expect(rows).toHaveLength(1);
  });

  it('has the trigram indexes the item search relies on', async () => {
    const rows = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'InventoryRecord' AND indexdef ILIKE '%gin_trgm_ops%'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
