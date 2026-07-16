// reminderScheduler.js — automatic 1-hour deadline email reminders
// Runs every 30 minutes. Finds batches whose deadline falls within the next
// 50-70 minutes (giving a consistent "~1 hour left" window), sends emails
// to all pending stores, then stamps autoReminderSentAt so it never fires twice.

import prisma from '../config/prisma.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const WINDOW_MIN_MS     = 50 * 60 * 1000; // 50 min from now
const WINDOW_MAX_MS     = 90 * 60 * 1000; // 90 min from now

async function runReminderCheck() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + WINDOW_MIN_MS);
    const windowEnd   = new Date(now.getTime() + WINDOW_MAX_MS);

    // Find batches whose deadline falls in the 50-90 min window
    // and haven't had an automated reminder sent yet
    const batches = await prisma.uploadBatch.findMany({
      where: {
        submissionDeadline: { gte: windowStart, lte: windowEnd },
        autoReminderSentAt: null,
      },
      select: { id: true, inventoryDate: true, submissionDeadline: true },
    });

    if (batches.length === 0) return;

    const { sendDeadlineReminderEmail } = await import('./emailService.js');

    for (const batch of batches) {
      // Find store managers for stores that are still pending in this batch
      const pendingStoreIds = await prisma.inventoryRecord.findMany({
        where: { batchId: batch.id, status: 'PENDING' },
        select: { storeId: true },
        distinct: ['storeId'],
      });

      if (pendingStoreIds.length === 0) {
        // All submitted — mark as done so we don't check again
        await prisma.uploadBatch.update({
          where: { id: batch.id },
          data: { autoReminderSentAt: now },
        });
        continue;
      }

      const storeIds = pendingStoreIds.map(r => r.storeId);
      const managers = await prisma.user.findMany({
        where: {
          role: 'STORE_MANAGER',
          isActive: true,
          storeId: { in: storeIds },
          email: { not: null },
        },
        include: { store: true },
      });

      if (managers.length > 0) {
        const result = await sendDeadlineReminderEmail({
          managers,
          inventoryDate: batch.inventoryDate,
          deadline: batch.submissionDeadline,
        });
        console.warn(`[scheduler] 1h reminder for batch ${batch.id}: sent=${result.sent}, failed=${result.failed}`);
      }

      // Stamp regardless — even if no emails sent, don't retry
      await prisma.uploadBatch.update({
        where: { id: batch.id },
        data: { autoReminderSentAt: now },
      });
    }
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
