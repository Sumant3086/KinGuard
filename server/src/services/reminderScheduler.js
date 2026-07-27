// reminderScheduler.js — automatic 1-hour deadline email reminders
// Runs every 30 minutes. Finds batches whose deadline falls within the next
// 50-90 minutes (giving a consistent "~1 hour left" window), sends emails
// to all pending stores, then stamps autoReminderSentAt so it never fires twice.

import prisma from '../config/prisma.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const WINDOW_MIN_MS     = 50 * 60 * 1000; // 50 min from now
const WINDOW_MAX_MS     = 90 * 60 * 1000; // 90 min from now

async function purgeExpiredTokens() {
  try {
    const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    if (count > 0) console.warn(`[scheduler] Purged ${count} expired refresh token(s)`);
  } catch (err) {
    console.error('[scheduler] Token purge failed:', err.message);
  }
}

async function runReminderCheck() {
  // Purge expired refresh tokens on every tick — keeps the table from growing unboundedly
  await purgeExpiredTokens();

  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + WINDOW_MIN_MS);
    const windowEnd   = new Date(now.getTime() + WINDOW_MAX_MS);

    // Find batches whose deadline falls in the 50-90 min window
    // and haven't had an automated reminder sent yet
    const batches = await prisma.uploadBatch.findMany({
      where: {
        isDeleted:          false,
        submissionDeadline: { gte: windowStart, lte: windowEnd },
        autoReminderSentAt: null,
      },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });

    if (batches.length === 0) return;

    const { sendDeadlineReminderEmail } = await import('./emailService.js');

    // Process all due batches in parallel — each is independent
    await Promise.allSettled(batches.map(async (batch) => {
      try {
        // Fetch pending store IDs and managers in parallel
        const [pendingStoreRows, _] = await Promise.all([
          prisma.inventoryRecord.findMany({
            where: { batchId: batch.id, status: 'PENDING' },
            select: { storeId: true },
            distinct: ['storeId'],
          }),
          // Stamp immediately — even if email fails, don't retry (avoids spam)
          prisma.uploadBatch.update({ where: { id: batch.id }, data: { autoReminderSentAt: now } }),
        ]);

        if (pendingStoreRows.length === 0) return; // all submitted, already stamped above

        const storeIds = pendingStoreRows.map(r => r.storeId);
        const managers = await prisma.user.findMany({
          where: { role: 'STORE_MANAGER', isActive: true, storeId: { in: storeIds }, email: { not: null } },
          include: { store: true },
        });

        if (managers.length > 0) {
          const result = await sendDeadlineReminderEmail({
            managers,
            inventoryDate: batch.inventoryDate,
            deadline:      batch.submissionDeadline,
          });
          console.warn(`[scheduler] 1h reminder batch ${batch.id}: sent=${result.sent}, failed=${result.failed}`);
        }
      } catch (batchErr) {
        console.error(`[scheduler] Failed to process batch ${batch.id}:`, batchErr.message);
      }
    }));
  } catch (err) {
    console.error('[scheduler] Reminder check failed:', err.message);
  }
}

let _timer = null;
let _initTimer = null;

export function startReminderScheduler() {
  if (_timer) return; // guard against accidental double-start
  _initTimer = setTimeout(runReminderCheck, 2 * 60 * 1000);
  _timer = setInterval(runReminderCheck, CHECK_INTERVAL_MS);
  _timer.unref();
  console.warn('[scheduler] 1-hour deadline reminder scheduler started (every 30 min)');
}

export function stopReminderScheduler() {
  if (_initTimer) { clearTimeout(_initTimer);  _initTimer = null; }
  if (_timer)     { clearInterval(_timer); _timer = null; }
}
