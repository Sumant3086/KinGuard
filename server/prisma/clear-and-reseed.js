
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('🗑️  Clearing all existing data...');

  try {
    // Delete in correct order due to foreign keys
    await prisma.auditLog.deleteMany({});
    console.log('✅ Deleted audit logs');

    await prisma.inventoryRecord.deleteMany({});
    console.log('✅ Deleted inventory records');

    await prisma.uploadBatch.deleteMany({});
    console.log('✅ Deleted upload batches');

    await prisma.user.deleteMany({});
    console.log('✅ Deleted users');

    await prisma.store.deleteMany({});
    console.log('✅ Deleted stores');

    console.log('✅ All data cleared successfully\n');
  } catch (error) {
    console.error('Error during deletion:', error.message);
    throw error;
  }

  console.log('🌱 Starting fresh seed with image data...');

  // Create stores exactly as shown in image
  const stores = await Promise.all([
    prisma.store.create({
      data: {
        storeCode: '2036',
        storeName: 'Store 2036',
        isActive: true,
      },
    }),
    prisma.store.create({
      data: {
        storeCode: '2007',
        storeName: 'Store 2007',
        isActive: true,
      },
    }),
    prisma.store.create({
      data: {
        storeCode: '2024',
        storeName: 'Store 2024',
        isActive: true,
      },
    }),
    prisma.store.create({
      data: {
        storeCode: '2013',
        storeName: 'Store 2013',
        isActive: true,
      },
    }),
  ]);

  console.log('✅ Created 4 stores:', stores.map(s => s.storeCode).join(', '));

  // Hash password: Password123!
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Create users exactly as shown in image
  const admin = await prisma.user.create({
    data: {
      employeeId: 'ADMIN001',
      name: 'System Administrator',
      passwordHash,
      role: 'ADMIN',
      storeId: null, // Admin has access to all stores
      isActive: true,
    },
  });

  console.log('✅ Created Admin: ADMIN001');

  const manager2036 = await prisma.user.create({
    data: {
      employeeId: 'MGR2036',
      name: 'Manager Store 2036',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: stores[0].id, // Store 2036
      isActive: true,
    },
  });

  const manager2007 = await prisma.user.create({
    data: {
      employeeId: 'MGR2007',
      name: 'Manager Store 2007',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: stores[1].id, // Store 2007
      isActive: true,
    },
  });

  const manager2024 = await prisma.user.create({
    data: {
      employeeId: 'MGR2024',
      name: 'Manager Store 2024',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: stores[2].id, // Store 2024
      isActive: true,
    },
  });

  const manager2013 = await prisma.user.create({
    data: {
      employeeId: 'MGR2013',
      name: 'Manager Store 2013',
      passwordHash,
      role: 'STORE_MANAGER',
      storeId: stores[3].id, // Store 2013
      isActive: true,
    },
  });

  console.log('✅ Created 4 Store Managers: MGR2036, MGR2007, MGR2024, MGR2013');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Login Credentials (from image):');
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

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
