/**
 * Clears all operational data (stores, batches, inventory records, schedules)
 * while preserving all user accounts.
 *
 * Note: AuditLog is NOT cleared — a database-level trigger prevents deletion
 * to maintain an immutable audit trail. Use `npm run db:reset` to fully wipe
 * and re-seed the entire database including audit logs.
 *
 * Run with:  npm run db:clear   (from project root or server/)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all operational data (users and audit logs are preserved)...\n');

  await prisma.cycleSchedule.deleteMany({});
  console.log('✓ Cleared: CycleSchedule');

  await prisma.areaManagerReview.deleteMany({});
  console.log('✓ Cleared: AreaManagerReview');

  await prisma.batchDeadlineExtension.deleteMany({});
  console.log('✓ Cleared: BatchDeadlineExtension');

  await prisma.inventoryRecord.deleteMany({});
  console.log('✓ Cleared: InventoryRecord');

  await prisma.uploadBatch.deleteMany({});
  console.log('✓ Cleared: UploadBatch');

  // Remove store and AM assignments from users before deleting stores
  await prisma.user.updateMany({
    where: { storeId: { not: null } },
    data: { storeId: null },
  });
  await prisma.store.updateMany({
    where: { areaManagerId: { not: null } },
    data: { areaManagerId: null },
  });
  console.log('✓ Unlinked managers from stores');

  await prisma.store.deleteMany({});
  console.log('✓ Cleared: Store\n');

  const userCount = await prisma.user.count();
  console.log(`Done. ${userCount} user account(s) retained.`);
  console.log('Audit logs are preserved (immutable by design).');
  console.log('The system is now empty — create stores and upload an inventory file to begin.');
}

main()
  .catch((e) => { console.error('Failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
