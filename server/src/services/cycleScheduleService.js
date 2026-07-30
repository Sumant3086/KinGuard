// cycleScheduleService.js — automatic inventory cycle creation based on saved schedules
//
// Runs hourly. When a CycleSchedule's nextRunAt falls in the past, it logs that a
// cycle is due and advances nextRunAt to the next occurrence. It does NOT create
// batches — see the note in runScheduleCheck for why.

import prisma from '../config/prisma.js';
import { withSchedulerLock } from './schedulerLock.js';
import { logger, errorDetails } from '../config/logger.js';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // every 1 hour

// ── Date helpers ──────────────────────────────────────────────────────────────

export function computeNextRun(frequency, dayOfMonth, dayOfWeek, from = new Date()) {
  const next = new Date(from);
  next.setSeconds(0, 0);

  if (frequency === 'weekly') {
    const target = dayOfWeek ?? 1; // default Monday
    let diff = (target - from.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // advance to next week if same day
    next.setDate(from.getDate() + diff);
    next.setHours(6, 0, 0, 0);
    return next;
  }

  if (frequency === 'monthly') {
    const dom = Math.min(dayOfMonth ?? 1, 28);
    next.setDate(dom);
    next.setHours(6, 0, 0, 0);
    if (next <= from) next.setMonth(next.getMonth() + 1);
    return next;
  }

  if (frequency === 'quarterly') {
    const dom = Math.min(dayOfMonth ?? 1, 28);
    // Anchor to the calendar quarter (Jan/Apr/Jul/Oct) so runs are always three
    // months apart. Using the current month for the first run makes a quarterly
    // schedule fire like a monthly one once, then jump a quarter.
    const quarterStartMonth = Math.floor(next.getMonth() / 3) * 3;
    next.setMonth(quarterStartMonth, dom); // set month+day together — avoids day overflow
    next.setHours(6, 0, 0, 0);
    if (next <= from) next.setMonth(next.getMonth() + 3, dom);
    return next;
  }

  return null;
}

// ── Scheduler runner ──────────────────────────────────────────────────────────

// One instance only: two instances would both find the same due schedule and each
// advance nextRunAt, skipping a period and double-logging the due notice.
function runScheduleCheck() {
  return withSchedulerLock('cycle-schedule', CHECK_INTERVAL_MS, runScheduleCheckLocked)
    .catch(err => logger.error('Cycle schedule tick failed', errorDetails(err)));
}

async function runScheduleCheckLocked() {
  try {
    const now = new Date();

    const dueSchedules = await prisma.cycleSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
      include: { creator: { select: { id: true, name: true } } },
    });

    if (dueSchedules.length === 0) return;

    await Promise.allSettled(dueSchedules.map(async (schedule) => {
      try {
        // Determine inventory date = today at midnight
        const inventoryDate = new Date(now);
        inventoryDate.setHours(0, 0, 0, 0);

        // Submission deadline = inventoryDate + windowDays at end of day
        const deadline = new Date(inventoryDate);
        deadline.setDate(deadline.getDate() + schedule.submissionWindowDays);
        deadline.setHours(23, 59, 59, 0);

        // The scheduler does NOT create inventory batches — that requires an admin
        // to upload an actual inventory file with real item data. A batch created
        // here with status PENDING and 0 rows would block real uploads (duplicate
        // window check) and show as empty cycles for store managers.
        //
        // Instead, the scheduler just logs a reminder that a cycle is due and
        // advances nextRunAt. The admin sees the schedule in Admin → Schedules
        // and knows to upload the inventory file for this period.
        logger.info('Cycle schedule is due — admin should upload the inventory file', { scheduleId: schedule.id, schedule: schedule.name, inventoryDate: inventoryDate.toISOString().split('T')[0], deadline: deadline.toISOString().split('T')[0] });

        // Advance nextRunAt regardless
        const next = computeNextRun(schedule.frequency, schedule.dayOfMonth, schedule.dayOfWeek, now);
        await prisma.cycleSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: next, updatedAt: now },
        });
      } catch (err) {
        logger.error('Error processing cycle schedule', { scheduleId: schedule.id, schedule: schedule.name, ...errorDetails(err) });
      }
    }));
  } catch (err) {
    logger.error('Cycle schedule check failed', errorDetails(err));
  }
}

let _timer    = null;
let _initTimer = null;

export function startCycleScheduler() {
  if (_timer) return;
  // First run after 5 minutes to let the server fully warm up
  _initTimer = setTimeout(runScheduleCheck, 5 * 60 * 1000);
  _timer     = setInterval(runScheduleCheck, CHECK_INTERVAL_MS);
  _timer.unref();
  logger.info('Cycle scheduler started', { intervalMs: CHECK_INTERVAL_MS });
}

export function stopCycleScheduler() {
  if (_initTimer) { clearTimeout(_initTimer);  _initTimer = null; }
  if (_timer)     { clearInterval(_timer); _timer = null; }
}
