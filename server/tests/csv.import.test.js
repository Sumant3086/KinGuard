import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import prisma from '../src/config/prisma.js';
import app from '../src/app.js';

let adminUser;
let adminToken;
let testStore;

beforeAll(async () => {
  // Create test store
  testStore = await prisma.store.create({
    data: { storeCode: 'CSV_TEST', storeName: 'CSV Test Store', isActive: true },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash('test123', 10);
  adminUser = await prisma.user.create({
    data: {
      employeeId: 'CSV_ADMIN',
      name: 'CSV Test Admin',
      passwordHash,
      role: 'ADMIN',
      storeId: null,
      isActive: true,
    },
  });

  // Login to get token
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ employeeId: 'CSV_ADMIN', password: 'test123' });
  adminToken = loginResponse.body.token;
}, 30000);

describe('CSV Import Tests', () => {
  test('Upload CSV with standard format', async () => {
    const csvContent = `Store Code,Material Code,Material Name,System Quantity
CSV_TEST,MAT001,Widget A,100
CSV_TEST,MAT002,Widget B,200
CSV_TEST,MAT003,Widget C,150`;

    const response = await request(app)
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('inventoryDate', '2026-07-04')
      .attach('file', Buffer.from(csvContent), {
        filename: 'test_inventory.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(201);
    expect(response.body.successfulRows).toBe(3);
    expect(response.body.rejectedRows).toBe(0);
    expect(response.body.batchId).toBeDefined();

    // Verify records were created
    const records = await prisma.inventoryRecord.findMany({
      where: { batchId: response.body.batchId },
    });
    expect(records.length).toBe(3);
    expect(records[0].materialCode).toBe('MAT001');
    expect(records[0].systemQuantity).toBe(100);
  });

  test('Upload CSV with business format (Material Description, SYS)', async () => {
    const csvContent = `Store Code,Material,Material Description,SYS,Date
CSV_TEST,SKU001,Business Widget X,250,2026-07-04
CSV_TEST,SKU002,Business Widget Y,300,2026-07-04`;

    const response = await request(app)
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('inventoryDate', '2026-07-04')
      .attach('file', Buffer.from(csvContent), {
        filename: 'business_inventory.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(201);
    expect(response.body.successfulRows).toBe(2);
    expect(response.body.rejectedRows).toBe(0);

    // Verify records
    const records = await prisma.inventoryRecord.findMany({
      where: { batchId: response.body.batchId },
    });
    expect(records.length).toBe(2);
    expect(records[0].materialCode).toBe('SKU001');
    expect(records[0].materialName).toBe('Business Widget X');
    expect(records[0].systemQuantity).toBe(250);
  });

  test('Upload CSV with missing required fields - rejects rows', async () => {
    const csvContent = `Store Code,Material Code,Material Name,System Quantity
CSV_TEST,MAT010,Complete Widget,100
,MAT011,Missing Store,200
CSV_TEST,,Missing Material,150
CSV_TEST,MAT013,,300`;

    const response = await request(app)
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('inventoryDate', '2026-07-04')
      .attach('file', Buffer.from(csvContent), {
        filename: 'test_errors.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(201);
    expect(response.body.successfulRows).toBe(1); // Only first row is complete
    expect(response.body.rejectedRows).toBe(3);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  test('Upload CSV with invalid store code - rejects rows', async () => {
    const csvContent = `Store Code,Material Code,Material Name,System Quantity
INVALID_STORE,MAT020,Widget,100`;

    const response = await request(app)
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('inventoryDate', '2026-07-04')
      .attach('file', Buffer.from(csvContent), {
        filename: 'invalid_store.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(201);
    expect(response.body.successfulRows).toBe(0);
    expect(response.body.rejectedRows).toBe(1);
    expect(response.body.errors[0].error).toContain('Unknown store code');
  });

  test('Upload CSV with invalid quantity - rejects rows', async () => {
    const csvContent = `Store Code,Material Code,Material Name,System Quantity
CSV_TEST,MAT030,Widget,not_a_number
CSV_TEST,MAT031,Widget,-50`;

    const response = await request(app)
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('inventoryDate', '2026-07-04')
      .attach('file', Buffer.from(csvContent), {
        filename: 'invalid_qty.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(201);
    expect(response.body.successfulRows).toBe(0);
    expect(response.body.rejectedRows).toBe(2);
  });

  test('Upload CSV without authentication - returns 401', async () => {
    const csvContent = `Store Code,Material Code,Material Name,System Quantity
CSV_TEST,MAT040,Widget,100`;

    const response = await request(app)
      .post('/api/admin/uploads')
      .field('inventoryDate', '2026-07-04')
      .attach('file', Buffer.from(csvContent), {
        filename: 'test.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(401);
  });

  test('Upload CSV as Store Manager - returns 403', async () => {
    // Create store manager
    const passwordHash = await bcrypt.hash('test123', 10);
    const manager = await prisma.user.create({
      data: {
        employeeId: 'CSV_MGR',
        name: 'CSV Test Manager',
        passwordHash,
        role: 'STORE_MANAGER',
        storeId: testStore.id,
        isActive: true,
      },
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ employeeId: 'CSV_MGR', password: 'test123' });
    const mgrToken = loginResponse.body.token;

    const csvContent = `Store Code,Material Code,Material Name,System Quantity
CSV_TEST,MAT050,Widget,100`;

    const response = await request(app)
      .post('/api/admin/uploads')
      .set('Authorization', `Bearer ${mgrToken}`)
      .field('inventoryDate', '2026-07-04')
      .attach('file', Buffer.from(csvContent), {
        filename: 'test.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(403);

    // Cleanup
    await prisma.user.delete({ where: { id: manager.id } });
  });
});

afterAll(async () => {
  // Cleanup all test data
  await prisma.inventoryRecord.deleteMany({
    where: { storeId: testStore.id },
  });
  await prisma.uploadBatch.deleteMany({
    where: { uploadedBy: adminUser.id },
  });
  await prisma.user.delete({ where: { id: adminUser.id } });
  await prisma.store.delete({ where: { id: testStore.id } });
  await prisma.$disconnect();
}, 30000);
