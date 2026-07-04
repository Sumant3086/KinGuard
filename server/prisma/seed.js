import prisma from '../src/config/prisma.js';

async function main() {
  console.log('ℹ️  Seed script ready (no default data)');
  console.log('📊 Database will remain empty unless you add data manually.');
  console.log('');
  console.log('💡 To create data:');
  console.log('   1. Start the application');
  console.log('   2. Use the admin interface to create stores and users');
  console.log('   3. Or modify this seed.js file to add your own data');
  console.log('');
  console.log('✅ Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
