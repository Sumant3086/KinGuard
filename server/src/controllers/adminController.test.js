// Session-revocation tests for the admin user routes.
//
// Resetting a compromised account's password only helps if it also ends the sessions
// that account already has. A refresh token lives for 7 days, so leaving those rows in
// place means the attacker keeps access for a week after the reset. This is the kind of
// thing that is invisible in manual testing — the reset looks like it worked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  refreshToken: { deleteMany: vi.fn() },
  // Real $transaction takes an array of prepared operations; the mock records what it
  // was handed and resolves them so the controller gets its updated user back.
  $transaction: vi.fn(async (ops) => Promise.all(ops)),
  $connect: vi.fn(),
};
vi.mock('../config/prisma.js', () => ({ default: prismaMock }));
vi.mock('../services/auditService.js', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/serverCache.js', () => ({ sGet: () => undefined, sSet: () => {}, sInvalidate: () => {} }));
vi.mock('../middleware/auth.js', () => ({ invalidateUserCache: vi.fn() }));
vi.mock('../controllers/authController.js', () => ({ validatePassword: vi.fn() }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('$2b$10$hashed') } }));

const admin = await import('./adminController.js');
const { invalidateUserCache } = await import('../middleware/auth.js');

const TARGET = { id: 42, storeId: null, role: 'STORE_MANAGER', pendingApproval: false, isActive: true };
const UPDATED = { id: 42, employeeId: 'E42', name: 'Sam', role: 'STORE_MANAGER', passwordHash: '$2b$10$hashed' };

async function callAndCatch(handler, req) {
  const next = vi.fn();
  const res = { json: vi.fn() };
  await handler(req, res, next);
  return { err: next.mock.calls[0]?.[0] ?? null, res };
}

/** The operations handed to $transaction, as a flat list of Prisma delegate calls. */
function transactionOps() {
  return prismaMock.$transaction.mock.calls[0][0];
}

describe('updateUser', () => {
  beforeEach(() => {
    Object.values(prismaMock).forEach((v) => {
      if (typeof v.mockReset === 'function') v.mockReset();
      else Object.values(v).forEach((f) => f.mockReset());
    });
    prismaMock.$transaction.mockImplementation(async (ops) => Promise.all(ops));
    prismaMock.user.findUnique.mockResolvedValue(TARGET);
    prismaMock.user.update.mockResolvedValue(UPDATED);
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const req = (body) => ({ user: { id: 1, role: 'ADMIN' }, params: { id: '42' }, body });

  it('revokes the target account\'s refresh tokens when the password is reset', async () => {
    const { err } = await callAndCatch(admin.updateUser, req({ password: 'NewPassw0rd!' }));

    expect(err).toBeNull();
    expect(prismaMock.refreshToken.deleteMany)
      .toHaveBeenCalledWith({ where: { userId: 42 } });
  });

  it('revokes those sessions in the same transaction as the password write', async () => {
    // If the delete ran outside the transaction and the update rolled back, the user
    // would be logged out without their password actually having changed.
    await callAndCatch(admin.updateUser, req({ password: 'NewPassw0rd!' }));

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(transactionOps()).toHaveLength(2);
  });

  it('forces a password change on the target\'s next login', async () => {
    await callAndCatch(admin.updateUser, req({ password: 'NewPassw0rd!' }));

    expect(prismaMock.user.update.mock.calls[0][0].data)
      .toMatchObject({ mustChangePassword: true });
  });

  it('leaves sessions alone when the edit does not touch the password', async () => {
    await callAndCatch(admin.updateUser, req({ name: 'Sam Renamed' }));

    expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(transactionOps()).toHaveLength(1);
  });

  it('drops the target from the auth cache so the change takes effect at once', async () => {
    await callAndCatch(admin.updateUser, req({ isActive: false }));

    expect(invalidateUserCache).toHaveBeenCalledWith(42);
  });

  it('never returns the password hash to the caller', async () => {
    const { res } = await callAndCatch(admin.updateUser, req({ password: 'NewPassw0rd!' }));

    expect(res.json.mock.calls[0][0]).not.toHaveProperty('passwordHash');
  });

  it('refuses to edit a user still awaiting approval', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...TARGET, pendingApproval: true });

    const { err } = await callAndCatch(admin.updateUser, req({ name: 'Sam' }));

    expect(err?.statusCode).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to assign an area manager to a single store', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...TARGET, role: 'AREA_MANAGER' });

    const { err } = await callAndCatch(admin.updateUser, req({ storeId: '5' }));

    expect(err?.statusCode).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 for a user that does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const { err } = await callAndCatch(admin.updateUser, req({ name: 'Sam' }));

    expect(err?.statusCode).toBe(404);
  });
});
