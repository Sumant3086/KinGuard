import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function clearData() {
  console.log('🗑️  Clearing all existing data...\n');

  // Use raw SQL for faster deletion with CASCADE if needed
  try {
    await prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE`;
    console.log('✅ Cleared audit logs');
  } catch (e) {
    console.log('⚠️  Audit logs already empty or error:', e.message);
  }

  try {
    await prisma.$executeRaw`TRUNCATE TABLE "InventoryRecord" CASCADE`;
    console.log('✅ Cleared inventory records');
  } catch (e) {
    console.log('⚠️  Inventory records already empty or error:', e.message);
  }

  try {
    await prisma.$executeRaw`TRUNCATE TABLE "UploadBatch" CASCADE`;
    console.log('✅ Cleared upload batches');
  } catch (e) {
    console.log('⚠️  Upload batches already empty or error:', e.message);
  }

  try {
    await prisma.$executeRaw`TRUNCATE TABLE "User" RESTART IDENTITY CASCADE`;
    console.log('✅ Cleared users');
  } catch (e) {
    console.log('⚠️  Users already empty or error:', e.message);
  }

  try {
    await prisma.$executeRaw`TRUNCATE TABLE "Store" RESTART IDENTITY CASCADE`;
    console.log('✅ Cleared stores');
  } catch (e) {
    console.log('⚠️  Stores already empty or error:', e.message);
  }

  console.log('\n✅ Data clearing completed\n');
}

async function seedData() {
  console.log('🌱 Seeding fresh data from image...\n');

  // Hash password: Password123!
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Create stores
  const store2036 = await prisma.store.create({
    data: { storeCode: '2036', storeName: 'Store 2036', isActive: true },
  });
  console.log('✅ Created Store 2036');

  const store2007 = await prisma.store.create({
    data: { storeCode: '2007', storeName: 'Store 2007', isActive: true },
  });
  console.log('✅ Created Store 2007');

  const store2024 = await prisma.store.create({
    data: { storeCode: '2024', storeName: 'Store 2024', isActive: true },
  });
  console.log('✅ Created Store 2024');

  const store2013 = await prisma.store.create({
    data: { storeCode: '2013', storeName: 'Store 2013', isActive: true },
  });
  console.log('✅ Created Store 2013');

  // Create Admin
  await prisma.user.create({
    data: {
      employeeId: 'ADMIN001',
      name: 'System Administrator',
      passwordHash,
      role: 'ADMIN',
      storeId: null,
      isActive: true,
    },
  });
  console.log('✅ Created Admin: ADMIN001');

  // Create Store Managers
  await prisma.user.create({
    data: {
      employeeId: 'MGR2036',
      name: 'Manager Store 2036',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: store2036.id,
      isActive: true,
    },
  });
  console.log('✅ Created Store Manager: MGR2036');

  await prisma.user.create({
    data: {
      employeeId: 'MGR2007',
      name: 'Manager Store 2007',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: store2007.id,
      isActive: true,
    },
  });
  console.log('✅ Created Store Manager: MGR2007');

  await prisma.user.create({
    data: {
      employeeId: 'MGR2024',
      name: 'Manager Store 2024',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: store2024.id,
      isActive: true,
    },
  });
  console.log('✅ Created Store Manager: MGR2024');

  await prisma.user.create({
    data: {
      employeeId: 'MGR2013',
      name: 'Manager Store 2013',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: store2013.id,
      isActive: true,
    },
  });
  console.log('✅ Created Store Manager: MGR2013');

  console.log('\n🎉 Seed completed successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Login Credentials (from image):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Role             Store Code   Employee ID   Password');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Admin            All stores   ADMIN001      Password123!');
  console.log('Store Manager    2036         MGR2036       Password123!');
  console.log('Store Manager    2007         MGR2007       Password123!');
  console.log('Store Manager    2024         MGR2024       Password123!');
  console.log('Store Manager    2013         MGR2013       Password123!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function main() {
  await clearData();
  await seedData();
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('✅ Database connection closed');
  });
