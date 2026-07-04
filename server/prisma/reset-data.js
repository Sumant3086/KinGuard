import prisma from '../src/config/prisma.js';

async function resetData() {
  try {
    console.log('🗑️  Deleting all data...');

    // Delete in correct order due to foreign key constraints
    await prisma.auditLog.deleteMany({});
    console.log('✅ Deleted all audit logs');

    await prisma.inventoryRecord.deleteMany({});
    console.log('✅ Deleted all inventory records');

    await prisma.uploadBatch.deleteMany({});
    console.log('✅ Deleted all upload batches');

    await prisma.user.deleteMany({});
    console.log('✅ Deleted all users');

    await prisma.store.deleteMany({});
    console.log('✅ Deleted all stores');

    console.log('\n✨ All seeded data has been removed!');
    console.log('📊 Database is now empty and ready for fresh data.');
    console.log('\n💡 To add new data, run: npm run seed');
  } catch (error) {
    console.error('❌ Error resetting data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetData();
