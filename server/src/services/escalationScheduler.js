// escalationScheduler.js — post-deadline escalation notifications
//
// After an inventory deadline passes, pending stores are escalated in tiers:
//   Level 1 (0–24h past deadline)  → Area Manager email: "Your stores missed the deadline"
//   Level 2 (24–48h past deadline) → Admin email: "Urgent — stores still unsubmitted"
//
// escalationLevel on UploadBatch tracks which tier has fired so we never duplicate.

import prisma from '../config/prisma.js';
import { withSchedulerLock } from './schedulerLock.js';

const CHECK_INTERVAL_MS   = 30 * 60 * 1000; // every 30 minutes
const TIER1_DELAY_MS      = 0;               // immediately after deadline
const TIER2_DELAY_MS      = 24 * 60 * 60 * 1000; // 24h after deadline

// One instance only: escalationLevel is read and stamped in separate statements, so
// concurrent instances would both pass the `< 1` check and mail every AM twice.
function runEscalationCheck() {
  return withSchedulerLock('escalation', CHECK_INTERVAL_MS, runEscalationCheckLocked)
    .catch(err => console.error('[escalation] Tick failed:', err.message));
}

async function runEscalationCheckLocked() {
  try {
    const now = new Date();

    // Batches where deadline has passed and there are still pending records
    const overdueBatches = await prisma.uploadBatch.findMany({
      where: {
        isDeleted:          false,
        submissionDeadline: { lt: now },
        escalationLevel:    { lt: 2 },
      },
      select: { id: true, inventoryDate: true, submissionDeadline: true, escalationLevel: true },
    });

    if (overdueBatches.length === 0) return;

    const { sendEscalationEmail } = await import('./emailService.js');

    await Promise.allSettled(overdueBatches.map(async (batch) => {
      try {
        const hoursOverdue = (now - new Date(batch.submissionDeadline)) / 3_600_000;

        // Find stores that are still pending in this batch
        const allPendingRows = await prisma.inventoryRecord.findMany({
          where: { batchId: batch.id, status: 'PENDING' },
          select: { storeId: true },
          distinct: ['storeId'],
        });

        // A store granted an extension is not overdue until ITS deadline passes.
        // Escalating on the batch deadline alone reports stores as delinquent to their
        // AM and to admins while the app is still telling those stores they have time.
        const activeExtensions = await prisma.batchDeadlineExtension.findMany({
          where: { batchId: batch.id, newDeadline: { gt: now } },
          select: { storeId: true },
        });
        const extendedStoreIds = new Set(activeExtensions.map(e => e.storeId));
        const pendingRows = allPendingRows.filter(r => !extendedStoreIds.has(r.storeId));

        if (allPendingRows.length === 0) {
          // Genuinely everyone submitted — advance to max so we stop checking this batch
          await prisma.uploadBatch.update({ where: { id: batch.id }, data: { escalationLevel: 2 } });
          return;
        }
        if (pendingRows.length === 0) {
          // Everyone still outstanding holds a live extension. Leave escalationLevel
          // alone so this batch is re-examined once those extensions lapse.
          return;
        }

        const storeIds     = pendingRows.map(r => r.storeId);
        const pendingStores = await prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, storeName: true, storeCode: true, areaManagerId: true },
        });

        const inventoryDate = new Date(batch.inventoryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

        // Tier 1: notify Area Managers (fires from 0h up until 24h overdue)
        // Stamp BEFORE sending — if the process crashes after stamping but before
        // sending, the email is missed once. Stamping after sending risks duplicates
        // on the next 30-minute tick if the process crashes between send and stamp.
        if (batch.escalationLevel < 1 && hoursOverdue >= TIER1_DELAY_MS / 3_600_000) {
          await prisma.uploadBatch.update({ where: { id: batch.id }, data: { escalationLevel: 1 } });
          const amIds = [...new Set(pendingStores.map(s => s.areaManagerId).filter(Boolean))];
          if (amIds.length > 0) {
            const ams = await prisma.user.findMany({
              where: { id: { in: amIds }, isActive: true, email: { not: null } },
              select: { email: true, name: true, id: true },
            });
            await Promise.allSettled(ams.map(am => {
              const theirPendingStores = pendingStores.filter(s => s.areaManagerId === am.id);
              return sendEscalationEmail({
                to: am.email, toName: am.name,
                tier: 1, inventoryDate,
                pendingStores: theirPendingStores,
                hoursOverdue: Math.round(hoursOverdue),
              });
            }));
          }
          console.warn(`[escalation] Tier 1 sent for batch ${batch.id} — ${storeIds.length} stores pending, ${Math.round(hoursOverdue)}h overdue`);
        }

        // Tier 2: notify Admins (fires after 24h overdue) — stamp first, same rationale
        if (batch.escalationLevel < 2 && hoursOverdue >= TIER2_DELAY_MS / 3_600_000) {
          await prisma.uploadBatch.update({ where: { id: batch.id }, data: { escalationLevel: 2 } });
          const admins = await prisma.user.findMany({
            where: { role: 'ADMIN', isActive: true, email: { not: null } },
            select: { email: true, name: true },
          });
          await Promise.allSettled(admins.map(admin =>
            sendEscalationEmail({
              to: admin.email, toName: admin.name,
              tier: 2, inventoryDate,
              pendingStores,
              hoursOverdue: Math.round(hoursOverdue),
            })
          ));
          console.warn(`[escalation] Tier 2 sent for batch ${batch.id} — ${storeIds.length} stores still pending, ${Math.round(hoursOverdue)}h overdue`);
        }
      } catch (batchErr) {
        console.error(`[escalation] Error processing batch ${batch.id}:`, batchErr.message);
      }
    }));
  } catch (err) {
    console.error('[escalation] Check failed:', err.message);
  }
}

let _timer    = null;
let _initTimer = null;

export function startEscalationScheduler() {
  if (_timer) return;
  // First check after 3 minutes (let server warm up)
  _initTimer = setTimeout(runEscalationCheck, 3 * 60 * 1000);
  _timer     = setInterval(runEscalationCheck, CHECK_INTERVAL_MS);
  _timer.unref();
  console.warn('[escalation] Post-deadline escalation scheduler started (every 30 min)');
}

export function stopEscalationScheduler() {
  if (_initTimer) { clearTimeout(_initTimer);  _initTimer = null; }
  if (_timer)     { clearInterval(_timer); _timer = null; }
}
