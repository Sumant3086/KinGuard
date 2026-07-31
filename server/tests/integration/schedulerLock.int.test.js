// The scheduler lease is a single INSERT ... ON CONFLICT DO UPDATE ... WHERE statement.
// Its correctness is entirely a property of how PostgreSQL resolves that conflict, so a
// unit test with a mocked $queryRaw can only assert that the string was sent. These
// tests run real concurrent claims and count how many won.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, resetDb } from './helpers.js';
import { withSchedulerLock } from '../../src/services/schedulerLock.js';

const MINUTE = 60_000;

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await resetDb(); });

describe('withSchedulerLock', () => {
  it('runs the work and records who holds the lease', async () => {
    let ran = 0;
    const won = await withSchedulerLock('reminder', 10 * MINUTE, async () => { ran += 1; });

    expect(won).toBe(true);
    expect(ran).toBe(1);

    const lock = await prisma.schedulerLock.findUnique({ where: { name: 'reminder' } });
    expect(lock).not.toBeNull();
    expect(lock.owner).toContain(String(process.pid));
    expect(lock.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('lets exactly one of two simultaneous ticks through', async () => {
    let ran = 0;
    const results = await Promise.all([
      withSchedulerLock('reminder', 10 * MINUTE, async () => { ran += 1; }),
      withSchedulerLock('reminder', 10 * MINUTE, async () => { ran += 1; }),
    ]);

    // This is the duplicate-email bug the lease exists to prevent.
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(ran).toBe(1);
  });

  it('lets exactly one of ten simultaneous ticks through', async () => {
    let ran = 0;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => withSchedulerLock('escalation', 10 * MINUTE, async () => { ran += 1; })),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(ran).toBe(1);
  });

  it('holds the lease for the rest of the period rather than releasing on completion', async () => {
    await withSchedulerLock('reminder', 10 * MINUTE, async () => {});

    // A second instance whose timer fires moments later must not redo the work.
    let ran = 0;
    const won = await withSchedulerLock('reminder', 10 * MINUTE, async () => { ran += 1; });

    expect(won).toBe(false);
    expect(ran).toBe(0);
  });

  it('hands the lease on once it has expired', async () => {
    await prisma.schedulerLock.create({
      data: { name: 'reminder', lockedUntil: new Date(Date.now() - MINUTE), owner: 'previous-instance' },
    });

    let ran = 0;
    const won = await withSchedulerLock('reminder', 10 * MINUTE, async () => { ran += 1; });

    expect(won).toBe(true);
    expect(ran).toBe(1);
    const lock = await prisma.schedulerLock.findUnique({ where: { name: 'reminder' } });
    expect(lock.owner).not.toBe('previous-instance');
  });

  it('keeps separate jobs independent', async () => {
    const a = await withSchedulerLock('reminder',   10 * MINUTE, async () => {});
    const b = await withSchedulerLock('escalation', 10 * MINUTE, async () => {});

    expect([a, b]).toEqual([true, true]);
    expect(await prisma.schedulerLock.count()).toBe(2);
  });

  it('does not swallow an error thrown by the work itself', async () => {
    // Only lock failures are meant to be absorbed; a broken tick must still surface.
    await expect(
      withSchedulerLock('reminder', 10 * MINUTE, async () => { throw new Error('tick blew up'); }),
    ).rejects.toThrow('tick blew up');
  });
});
