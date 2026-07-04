import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Create stores
  const stores = await Promise.all([
    prisma.store.upsert({
      where: { storeCode: '2036' },
      update: {},
      create: {
        storeCode: '2036',
        storeName: 'Store 2036',
        isActive: true,
      },
    }),
    prisma.store.upsert({
      where: { storeCode: '2007' },
      update: {},
      create: {
        storeCode: '2007',
        storeName: 'Store 2007',
        isActive: true,
      },
    }),
    prisma.store.upsert({
      where: { storeCode: '2024' },
      update: {},
      create: {
        storeCode: '2024',
        storeName: 'Store 2024',
        isActive: true,
      },
    }),
    prisma.store.upsert({
      where: { storeCode: '2013' },
      update: {},
      create: {
        storeCode: '2013',
        storeName: 'Store 2013',
        isActive: true,
      },
    }),
  ]);

  console.log('Created stores:', stores.length);

  // Hash password for all users (Password123!)
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { employeeId: 'ADMIN001' },
    update: {},
    create: {
      employeeId: 'ADMIN001',
      name: 'System Admin',
      passwordHash,
      role: 'ADMIN',
      storeId: null,
      isActive: true,
    },
  });

  console.log('Created admin user');

  // Create store managers
  const managers = await Promise.all([
    prisma.user.upsert({
      where: { employeeId: 'MGR2036' },
      update: {},
      create: {
        employeeId: 'MGR2036',
        name: 'Manager Store 2036',
        passwordHash,
        role: 'STORE_MANAGER',
        storeId: stores[0].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { employeeId: 'MGR2007' },
      update: {},
      create: {
        employeeId: 'MGR2007',
        name: 'Manager Store 2007',
        passwordHash,
        role: 'STORE_MANAGER',
        storeId: stores[1].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { employeeId: 'MGR2024' },
      update: {},
      create: {
        employeeId: 'MGR2024',
        name: 'Manager Store 2024',
        passwordHash,
        role: 'STORE_MANAGER',
        storeId: stores[2].id,
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { employeeId: 'MGR2013' },
      update: {},
      create: {
        employeeId: 'MGR2013',
        name: 'Manager Store 2013',
        passwordHash,
        role: 'STORE_MANAGER',
        storeId: stores[3].id,
        isActive: true,
      },
    }),
  ]);

  console.log('Created store managers:', managers.length);

  // Create sample upload batch
  const batch = await prisma.uploadBatch.create({
    data: {
      originalFileName: 'sample_inventory.xlsx',
      storedFileName: null,
      uploadedBy: admin.id,
      inventoryDate: new Date('2024-01-15'),
      totalRows: 8,
      successfulRows: 8,
      rejectedRows: 0,
      status: 'COMPLETED',
    },
  });

  console.log('Created upload batch');

  // Create sample inventory records
  const inventoryRecords = [
    // Store 2036 records
    {
      batchId: batch.id,
      storeId: stores[0].id,
      materialCode: 'MAT001',
      materialName: 'Widget A',
      systemQuantity: 100,
    },
    {
      batchId: batch.id,
      storeId: stores[0].id,
      materialCode: 'MAT002',
      materialName: 'Widget B',
      systemQuantity: 55,
    },
    // Store 2007 records
    {
      batchId: batch.id,
      storeId: stores[1].id,
      materialCode: 'MAT001',
      materialName: 'Widget A',
      systemQuantity: 75,
    },
    {
      batchId: batch.id,
      storeId: stores[1].id,
      materialCode: 'MAT003',
      materialName: 'Widget C',
      systemQuantity: 30,
    },
    // Store 2024 records
    {
      batchId: batch.id,
      storeId: stores[2].id,
      materialCode: 'MAT002',
      materialName: 'Widget B',
      systemQuantity: 45,
    },
    {
      batchId: batch.id,
      storeId: stores[2].id,
      materialCode: 'MAT004',
      materialName: 'Widget D',
      systemQuantity: 20,
    },
    // Store 2013 records
    {
      batchId: batch.id,
      storeId: stores[3].id,
      materialCode: 'MAT001',
      materialName: 'Widget A',
      systemQuantity: 90,
    },
    {
      batchId: batch.id,
      storeId: stores[3].id,
      materialCode: 'MAT005',
      materialName: 'Widget E',
      systemQuantity: 15,
    },
  ];

  await prisma.inventoryRecord.createMany({
    data: inventoryRecords,
  });

  console.log('Created inventory records:', inventoryRecords.length);

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
