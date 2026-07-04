import prisma from '../src/config/prisma.js';

async function verifyEmpty() {
  try {
    const stores = await prisma.store.count();
    const users = await prisma.user.count();
    const batches = await prisma.uploadBatch.count();
    const records = await prisma.inventoryRecord.count();
    const auditLogs = await prisma.auditLog.count();

    console.log('📊 Database Status:');
    console.log('==================');
    console.log('Stores:', stores);
    console.log('Users:', users);
    console.log('Upload Batches:', batches);
    console.log('Inventory Records:', records);
    console.log('Audit Logs:', auditLogs);
    console.log('==================');
    
    const isEmpty = stores === 0 && users === 0 && batches === 0 && records === 0;
    
    if (isEmpty) {
      console.log('✅ Database is completely empty!');
    } else {
      console.log('⚠️  Database still contains data.');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyEmpty();
