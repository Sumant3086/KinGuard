import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_EMPLOYEE_ID = 'ADMIN001';
const DEFAULT_PASSWORD     = 'Admin@123';

async function main() {
  console.log('Initialising database...');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { employeeId: DEFAULT_EMPLOYEE_ID },
    update: {},
    create: {
      employeeId: DEFAULT_EMPLOYEE_ID,
      name: 'System Administrator',
      passwordHash,
      role: 'ADMIN',
      storeId: null,
      isActive: true,
    },
  });

  console.log('\n✓ Admin account ready');
  console.log(`  Employee ID : ${admin.employeeId}`);
  console.log(`  Password    : ${DEFAULT_PASSWORD}`);
  console.log('\n⚠  Change this password immediately after first login (Admin → Users → Edit).\n');
  console.log('Seed complete. The system is empty and ready for use.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
