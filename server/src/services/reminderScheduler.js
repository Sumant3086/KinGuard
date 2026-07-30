// reminderScheduler.js — automatic 1-hour deadline email reminders
// Runs every 30 minutes. Finds batches whose deadline falls within the next
// 50-90 minutes (giving a consistent "~1 hour left" window), sends emails
// to all pending stores, then stamps autoReminderSentAt so it never fires twice.

import prisma from '../config/prisma.js';
import { withSchedulerLock } from './schedulerLock.js';
import { logger, errorDetails } from '../config/logger.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const WINDOW_MIN_MS     = 50 * 60 * 1000; // 50 min from now
const WINDOW_MAX_MS     = 90 * 60 * 1000; // 90 min from now

async function purgeExpiredTokens() {
  try {
    const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    if (count > 0) logger.info('Purged expired refresh tokens', { count });
  } catch (err) {
    logger.error('Token purge failed', errorDetails(err));
  }
}

// One instance only: without this, two instances both see autoReminderSentAt = null
// for the same batch and every pending store manager gets the reminder twice.
// The .catch matters: this is a timer callback, so a rejection here would be an
// unhandled rejection and take the process down.
function runReminderCheck() {
  return withSchedulerLock('reminder', CHECK_INTERVAL_MS, runReminderCheckLocked)
    .catch(err => logger.error('Reminder tick failed', errorDetails(err)));
}

async function runReminderCheckLocked() {
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
        // Fetch pending store IDs and live extensions in parallel
        const [pendingStoreRows, activeExtensions] = await Promise.all([
          prisma.inventoryRecord.findMany({
            where: { batchId: batch.id, status: 'PENDING' },
            select: { storeId: true },
            distinct: ['storeId'],
          }),
          prisma.batchDeadlineExtension.findMany({
            where: { batchId: batch.id, newDeadline: { gt: now } },
            select: { storeId: true },
          }),
          // Stamp immediately — even if email fails, don't retry (avoids spam)
          prisma.uploadBatch.update({ where: { id: batch.id }, data: { autoReminderSentAt: now } }),
        ]);

        if (pendingStoreRows.length === 0) return; // all submitted, already stamped above

        // Skip stores holding a live extension — the batch deadline is not their deadline,
        // so "1 hour left" would be wrong for them.
        const extendedStoreIds = new Set(activeExtensions.map(e => e.storeId));
        const storeIds = pendingStoreRows.map(r => r.storeId).filter(id => !extendedStoreIds.has(id));
        if (storeIds.length === 0) return;
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
          logger.info('1h deadline reminder sent', { batchId: batch.id, sent: result.sent, failed: result.failed });
        }
      } catch (batchErr) {
        logger.error('Failed to process batch for reminder', { batchId: batch.id, ...errorDetails(batchErr) });
      }
    }));
  } catch (err) {
    logger.error('Reminder check failed', errorDetails(err));
  }
}

let _timer = null;
let _initTimer = null;

export function startReminderScheduler() {
  if (_timer) return; // guard against accidental double-start
  _initTimer = setTimeout(runReminderCheck, 2 * 60 * 1000);
  _timer = setInterval(runReminderCheck, CHECK_INTERVAL_MS);
  _timer.unref();
  logger.info('Reminder scheduler started', { intervalMs: CHECK_INTERVAL_MS });
}

export function stopReminderScheduler() {
  if (_initTimer) { clearTimeout(_initTimer);  _initTimer = null; }
  if (_timer)     { clearInterval(_timer); _timer = null; }
}
