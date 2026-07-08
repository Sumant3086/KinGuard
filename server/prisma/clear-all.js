/**
 * Clears all operational data (stores, batches, inventory, audit logs)
 * while preserving all user accounts.
 *
 * Run with:  npm run db:clear   (from project root or server/)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all operational data (users are preserved)...\n');

  await prisma.auditLog.deleteMany({});
  console.log('✓ Cleared: AuditLog');

  await prisma.batchDeadlineExtension.deleteMany({});
  console.log('✓ Cleared: BatchDeadlineExtension');

  await prisma.inventoryRecord.deleteMany({});
  console.log('✓ Cleared: InventoryRecord');

  await prisma.uploadBatch.deleteMany({});
  console.log('✓ Cleared: UploadBatch');

  // Remove store assignments from all users before deleting stores
  await prisma.user.updateMany({
    where: { storeId: { not: null } },
    data: { storeId: null },
  });
  console.log('✓ Unlinked store managers from stores');

  await prisma.store.deleteMany({});
  console.log('✓ Cleared: Store\n');

  const userCount = await prisma.user.count();
  console.log(`Done. ${userCount} user account(s) retained.`);
  console.log('The system is now empty — create stores and upload an inventory file to begin.');
}

main()
  .catch((e) => { console.error('Failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
