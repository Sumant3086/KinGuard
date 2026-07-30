import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRaw = vi.fn();
vi.mock('../config/prisma.js', () => ({ default: { $queryRaw: (...a) => queryRaw(...a) } }));

const { withSchedulerLock } = await import('./schedulerLock.js');

describe('withSchedulerLock', () => {
  beforeEach(() => {
    queryRaw.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('runs the work when the lease is claimed', async () => {
    queryRaw.mockResolvedValue([{ name: 'reminder' }]);
    const fn = vi.fn().mockResolvedValue(undefined);

    const ran = await withSchedulerLock('reminder', 1000, fn);

    expect(ran).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('skips the work when another instance holds the lease', async () => {
    // No rows back means the ON CONFLICT ... WHERE lockedUntil < now() guard did not fire.
    queryRaw.mockResolvedValue([]);
    const fn = vi.fn();

    const ran = await withSchedulerLock('reminder', 1000, fn);

    expect(ran).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('skips the tick rather than throwing when the lock query fails', async () => {
    queryRaw.mockRejectedValue(new Error('connection reset'));
    const fn = vi.fn();

    const ran = await withSchedulerLock('reminder', 1000, fn);

    expect(ran).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('only lets one of several concurrent instances run the same tick', async () => {
    // Emulate the database: the first claim wins, the rest see a live lease.
    let claimed = false;
    queryRaw.mockImplementation(async () => {
      if (claimed) return [];
      claimed = true;
      return [{ name: 'reminder' }];
    });
    const fn = vi.fn().mockResolvedValue(undefined);

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => withSchedulerLock('reminder', 1000, fn)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('requests a lease shorter than the interval so the next tick is never blocked', async () => {
    queryRaw.mockResolvedValue([{ name: 'reminder' }]);
    const before = Date.now();

    await withSchedulerLock('reminder', 60_000, async () => {});

    // Tagged template args are (strings, name, lockedUntil, owner).
    const lockedUntil = queryRaw.mock.calls[0][2];
    expect(lockedUntil).toBeInstanceOf(Date);
    expect(lockedUntil.getTime()).toBeGreaterThan(before);
    expect(lockedUntil.getTime()).toBeLessThan(before + 60_000);
  });

  it('propagates a failure from the work itself so the caller can log it', async () => {
    queryRaw.mockResolvedValue([{ name: 'reminder' }]);
    const fn = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(withSchedulerLock('reminder', 1000, fn)).rejects.toThrow('boom');
  });
});
