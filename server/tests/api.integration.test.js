import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import prisma from '../src/config/prisma.js';
import app from '../src/app.js';

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

  // Login to get tokens
  const loginResponse2036 = await request(app)
    .post('/api/auth/login')
    .send({ employeeId: 'TEST_MGR2036', password: 'test123' });
  token2036 = loginResponse2036.body.token;

  const loginResponse2007 = await request(app)
    .post('/api/auth/login')
    .send({ employeeId: 'TEST_MGR2007', password: 'test123' });
  token2007 = loginResponse2007.body.token;

  const loginResponseAdmin = await request(app)
    .post('/api/auth/login')
    .send({ employeeId: 'TEST_ADMIN', password: 'test123' });
  adminToken = loginResponseAdmin.body.token;

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
}, 30000);

describe('HTTP API Integration Tests', () => {
  describe('Authentication', () => {
    test('POST /api/auth/login - successful login returns token', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ employeeId: 'TEST_MGR2036', password: 'test123' });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.employeeId).toBe('TEST_MGR2036');
      expect(response.body.user.role).toBe('STORE_MANAGER');
    });

    test('POST /api/auth/login - wrong password returns 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ employeeId: 'TEST_MGR2036', password: 'wrongpassword' });

      expect(response.status).toBe(401);
    });

    test('GET /api/auth/me - returns current user when authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token2036}`);

      expect(response.status).toBe(200);
      expect(response.body.employeeId).toBe('TEST_MGR2036');
    });

    test('GET /api/auth/me - returns 401 without token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
    });
  });

  describe('Store Manager - Store Isolation', () => {
    test('GET /api/store/inventory - Store 2036 manager sees only Store 2036 records', async () => {
      const response = await request(app)
        .get('/api/store/inventory')
        .set('Authorization', `Bearer ${token2036}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.every((r) => r.storeId === store2036.id)).toBe(true);
    });

    test('GET /api/store/inventory - Store 2007 manager sees only Store 2007 records', async () => {
      const response = await request(app)
        .get('/api/store/inventory')
        .set('Authorization', `Bearer ${token2007}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.every((r) => r.storeId === store2007.id)).toBe(true);
    });

    test('PATCH /api/store/inventory/:id - Store 2036 manager cannot update Store 2007 record', async () => {
      const record2007 = await prisma.inventoryRecord.findFirst({
        where: { storeId: store2007.id },
      });

      const response = await request(app)
        .patch(`/api/store/inventory/${record2007.id}`)
        .set('Authorization', `Bearer ${token2036}`)
        .send({ physicalQuantity: 99 });

      expect(response.status).toBe(404);
    });

    test('PATCH /api/store/inventory/:id - Store 2036 manager can update Store 2036 record', async () => {
      const record2036 = await prisma.inventoryRecord.findFirst({
        where: { storeId: store2036.id, status: 'PENDING' },
      });

      const response = await request(app)
        .patch(`/api/store/inventory/${record2036.id}`)
        .set('Authorization', `Bearer ${token2036}`)
        .send({ physicalQuantity: 95, remarks: 'Test update' });

      expect(response.status).toBe(200);
      expect(response.body.physicalQuantity).toBe(95);
      expect(response.body.difference).toBe(-5);
      expect(response.body.remarks).toBe('Test update');
    });

    test('PATCH /api/store/inventory/:id - Cannot edit submitted record', async () => {
      // Create and submit a record
      const testRecord = await prisma.inventoryRecord.create({
        data: {
          batchId: batch.id,
          storeId: store2036.id,
          materialCode: 'MAT_SUBMITTED',
          materialName: 'Submitted Material',
          systemQuantity: 50,
          physicalQuantity: 50,
          difference: 0,
          status: 'SUBMITTED',
          submittedBy: manager2036.id,
          submittedAt: new Date(),
        },
      });

      const response = await request(app)
        .patch(`/api/store/inventory/${testRecord.id}`)
        .set('Authorization', `Bearer ${token2036}`)
        .send({ physicalQuantity: 45 });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Cannot edit submitted records');
    });

    test('GET /api/store/dashboard - returns store-specific statistics', async () => {
      const response = await request(app)
        .get('/api/store/dashboard')
        .set('Authorization', `Bearer ${token2036}`);

      expect(response.status).toBe(200);
      expect(response.body.store).toBeDefined();
      expect(response.body.store.storeCode).toBe('TEST2036');
      expect(response.body.stats).toBeDefined();
    });
  });

  describe('Store Manager - Authorization', () => {
    test('GET /api/admin/stores - Store Manager cannot access admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/stores')
        .set('Authorization', `Bearer ${token2036}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Admin - Access Control', () => {
    test('GET /api/admin/stores - Admin can access admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/stores')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('GET /api/admin/inventory - Admin can see all stores inventory', async () => {
      const response = await request(app)
        .get('/api/admin/inventory')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // Admin should see records from multiple stores
      const storeIds = new Set(response.body.map((r) => r.storeId));
      expect(storeIds.size).toBeGreaterThan(0);
    });

    test('GET /api/admin/dashboard - Admin can access dashboard', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.totalStores).toBeDefined();
    });
  });

  describe('Inventory Calculation', () => {
    test('Backend calculates difference correctly (shortage)', async () => {
      const record = await prisma.inventoryRecord.findFirst({
        where: { storeId: store2036.id, status: 'PENDING' },
      });

      const response = await request(app)
        .patch(`/api/store/inventory/${record.id}`)
        .set('Authorization', `Bearer ${token2036}`)
        .send({ physicalQuantity: record.systemQuantity - 10 });

      expect(response.status).toBe(200);
      expect(response.body.difference).toBe(-10);
    });

    test('Backend calculates difference correctly (excess)', async () => {
      const record = await prisma.inventoryRecord.findFirst({
        where: { storeId: store2036.id, status: 'PENDING' },
      });

      const response = await request(app)
        .patch(`/api/store/inventory/${record.id}`)
        .set('Authorization', `Bearer ${token2036}`)
        .send({ physicalQuantity: record.systemQuantity + 15 });

      expect(response.status).toBe(200);
      expect(response.body.difference).toBe(15);
    });

    test('Backend calculates difference correctly (match)', async () => {
      const record = await prisma.inventoryRecord.findFirst({
        where: { storeId: store2036.id, status: 'PENDING' },
      });

      const response = await request(app)
        .patch(`/api/store/inventory/${record.id}`)
        .set('Authorization', `Bearer ${token2036}`)
        .send({ physicalQuantity: record.systemQuantity });

      expect(response.status).toBe(200);
      expect(response.body.difference).toBe(0);
    });
  });
});

afterAll(async () => {
  // Cleanup
  if (batch?.id) {
    await prisma.inventoryRecord.deleteMany({
      where: { batchId: batch.id },
    });
    await prisma.uploadBatch.delete({ where: { id: batch.id } });
  }
  await prisma.user.deleteMany({
    where: {
      employeeId: { in: ['TEST_MGR2036', 'TEST_MGR2007', 'TEST_ADMIN'] },
    },
  });
  await prisma.store.deleteMany({
    where: { storeCode: { in: ['TEST2036', 'TEST2007'] } },
  });
  await prisma.$disconnect();
}, 30000);
