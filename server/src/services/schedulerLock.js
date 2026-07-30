// schedulerLock.js — makes a scheduled tick run on exactly one instance.
//
// The schedulers are plain setInterval timers inside the web process. With a single
// instance that is fine. With two, every tick fires twice: two instances both read
// `autoReminderSentAt: null` for the same batch, both send, and every store manager
// gets duplicate deadline mail. The per-batch stamps already in the schedulers do not
// close that race because the read and the stamp are not atomic with respect to
// each other.
//
// A tick claims a lease row before doing any work. The claim is a single statement,
// so Postgres row locking picks exactly one winner no matter how many instances race.
//
// The lease is deliberately never released early. Releasing on completion would let a
// second instance whose timer fires a few minutes later claim the same period and redo
// the work. Holding the lease until it expires makes it the "this period is already
// handled" marker, so the lease must be shorter than the tick interval (otherwise a
// tick gets skipped) and longer than the work takes (otherwise the work overlaps).
// LEASE_FRACTION picks that middle ground.

import prisma from '../config/prisma.js';
import { logger, errorDetails } from '../config/logger.js';

// Identifies which instance holds a lease. Only ever read by a human debugging why a
// tick did not fire, so uniqueness matters more than readability.
const OWNER = `${process.env.RENDER_INSTANCE_ID || 'local'}-${process.pid}`;

// Lease covers 80% of the interval: long enough to outlast any realistic tick, short
// enough that the lease is always free again before the next tick comes round.
const LEASE_FRACTION = 0.8;

/**
 * Run `fn` only if this instance wins the lease for `name`.
 *
 * @param {string} name          Stable key for the job, e.g. 'reminder'.
 * @param {number} intervalMs    The scheduler's tick interval; the lease is derived from it.
 * @param {() => Promise<void>} fn  The tick body.
 * @returns {Promise<boolean>}   true if this instance ran the work.
 */
export async function withSchedulerLock(name, intervalMs, fn) {
  const lockedUntil = new Date(Date.now() + intervalMs * LEASE_FRACTION);

  let claimed;
  try {
    // Seed-or-steal in one statement. The DO UPDATE fires only when the existing
    // lease has already expired, so a live lease makes this a no-op that returns
    // zero rows. now() is the database clock, which is the only clock all instances
    // agree on.
    claimed = await prisma.$queryRaw`
      INSERT INTO "SchedulerLock" ("name", "lockedUntil", "owner", "updatedAt")
      VALUES (${name}, ${lockedUntil}, ${OWNER}, now())
      ON CONFLICT ("name") DO UPDATE
         SET "lockedUntil" = EXCLUDED."lockedUntil",
             "owner"       = EXCLUDED."owner",
             "updatedAt"   = now()
       WHERE "SchedulerLock"."lockedUntil" < now()
      RETURNING "name"
    `;
  } catch (err) {
    // Never let a lock problem silently stop the schedulers. Skipping the tick is the
    // safe failure: the next one retries, and duplicate work is what we are avoiding.
    logger.error('Could not claim scheduler lease, skipping tick', { lock: name, ...errorDetails(err) });
    return false;
  }

  if (claimed.length === 0) return false; // another instance owns this period

  await fn();
  return true;
}
