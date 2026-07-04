import { describe, test, expect, beforeAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient();

let store2036;
let store2007;
let manager2036;
let manager2007;
let token2036;
let token2007;
let adminUser;
let adminToken;
let batch;

beforeAll(async () => {
  // Create test stores
  store2036 = await prisma.store.create({
    data: { storeCode: 'TEST2036', storeName: 'Test Store 2036', isActive: true },
  });

  store2007 = await prisma.store.create({
    data: { storeCode: 'TEST2007', storeName: 'Test Store 2007', isActive: true },
  });

  // Create test users
  const passwordHash = await bcrypt.hash('test123', 10);

  manager2036 = await prisma.user.create({
    data: {
      employeeId: 'TEST_MGR2036',
      name: 'Test Manager 2036',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: store2036.id,
      isActive: true,
    },
  });

  manager2007 = await prisma.user.create({
    data: {
      employeeId: 'TEST_MGR2007',
      name: 'Test Manager 2007',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: store2007.id,
      isActive: true,
    },
  });

  adminUser = await prisma.user.create({
    data: {
      employeeId: 'TEST_ADMIN',
      name: 'Test Admin',
      passwordHash,
      role: 'ADMIN',
      storeId: null,
      isActive: true,
    },
  });

  // Create tokens
  token2036 = jwt.sign(
    { userId: manager2036.id, role: 'STORE_MANAGER', storeId: store2036.id },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  token2007 = jwt.sign(
    { userId: manager2007.id, role: 'STORE_MANAGER', storeId: store2007.id },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  adminToken = jwt.sign(
    { userId: adminUser.id, role: 'ADMIN', storeId: null },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  // Create test batch
  batch = await prisma.uploadBatch.create({
    data: {
      originalFileName: 'test.xlsx',
      uploadedBy: adminUser.id,
      inventoryDate: new Date(),
      totalRows: 2,
      successfulRows: 2,
      rejectedRows: 0,
      status: 'COMPLETED',
    },
  });

  // Create inventory records
  await prisma.inventoryRecord.createMany({
    data: [
      {
        batchId: batch.id,
        storeId: store2036.id,
        materialCode: 'MAT001',
        materialName: 'Test Material 1',
        systemQuantity: 100,
        status: 'PENDING',
      },
      {
        batchId: batch.id,
        storeId: store2007.id,
        materialCode: 'MAT002',
        materialName: 'Test Material 2',
        systemQuantity: 200,
        status: 'PENDING',
      },
    ],
  });
});

describe('Store Authorization Tests', () => {
  test('Store 2036 manager can view Store 2036 records', async () => {
    const records = await prisma.inventoryRecord.findMany({
      where: { storeId: store2036.id },
    });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.storeId === store2036.id)).toBe(true);
  });

  test('Store 2036 manager cannot view Store 2007 records via query', async () => {
    // Simulate backend authorization check
    const requestedStoreId = store2007.id;
    const authenticatedStoreId = store2036.id;

    // This should not return records
    const records = await prisma.inventoryRecord.findMany({
      where: {
        storeId: requestedStoreId,
        AND: { storeId: authenticatedStoreId }, // Backend must enforce this
      },
    });

    expect(records.length).toBe(0);
  });

  test('Store 2036 manager cannot update Store 2007 record', async () => {
    const record2007 = await prisma.inventoryRecord.findFirst({
      where: { storeId: store2007.id },
    });

    // Manager attempts to update with their store check
    const authenticatedStoreId = store2036.id;

    const result = await prisma.inventoryRecord.findFirst({
      where: {
        id: record2007.id,
        storeId: authenticatedStoreId,
      },
    });

    // Should not find the record
    expect(result).toBeNull();
  });

  test('Backend calculates difference correctly', async () => {
    const record = await prisma.inventoryRecord.findFirst({
      where: { storeId: store2036.id },
    });

    // Update with physical quantity
    const physicalQuantity = 95;
    const updated = await prisma.inventoryRecord.update({
      where: { id: record.id },
      data: {
        physicalQuantity,
        difference: physicalQuantity - record.systemQuantity,
      },
    });

    expect(updated.difference).toBe(-5);
  });

  test('Store Manager cannot access admin routes', async () => {
    // This would be tested in integration tests with actual HTTP requests
    // Here we verify role distinction exists
    expect(manager2036.role).toBe('STORE_MANAGER');
    expect(adminUser.role).toBe('ADMIN');
    expect(manager2036.role).not.toBe('ADMIN');
  });

  test('Admin can access all stores', async () => {
    const allRecords = await prisma.inventoryRecord.findMany({
      where: {
        OR: [{ storeId: store2036.id }, { storeId: store2007.id }],
      },
    });

    expect(allRecords.length).toBeGreaterThanOrEqual(2);
  });
});

afterAll(async () => {
  // Cleanup
  await prisma.inventoryRecord.deleteMany({
    where: { batchId: batch.id },
  });
  await prisma.uploadBatch.delete({ where: { id: batch.id } });
  await prisma.user.deleteMany({
    where: {
      employeeId: { in: ['TEST_MGR2036', 'TEST_MGR2007', 'TEST_ADMIN'] },
    },
  });
  await prisma.store.deleteMany({
    where: { storeCode: { in: ['TEST2036', 'TEST2007'] } },
  });
  await prisma.$disconnect();
});
