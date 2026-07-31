// Session lifecycle against a real database.
//
// Almost nothing in authController can be checked with a mocked Prisma. The lockout
// counter is a database increment, the refresh rotation is an optimistic delete whose
// whole purpose is to lose a race, and a password change revokes every session in a
// transaction. Mocking any of those means asserting on the call you wrote rather than
// on what the database did with it.

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import bcrypt from 'bcrypt';
import {
  prisma, resetDb, runFull, makeUser, makeStore,
} from './helpers.js';
import * as auth from '../../src/controllers/authController.js';

const PASSWORD = 'Correct1Horse';
// Cost 4 rather than the application's 10. bcrypt.compare reads the cost from the hash,
// so login behaves identically, and the suite does not spend a minute hashing fixtures.
let hash;

/** A user who can actually log in. */
async function makeLoginUser(overrides = {}) {
  return makeUser({ passwordHash: hash, employeeId: 'EMP001', name: 'Ada', ...overrides });
}

function loginReq(employeeId, password) {
  return { body: { employeeId, password }, cookies: {}, headers: {} };
}

beforeAll(async () => {
  hash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(async () => {
  await resetDb();
  // The controller logs a DB-unavailable error and audit failures on stdout; the tests
  // that provoke those do not need the noise.
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterAll(() => { vi.restoreAllMocks(); });

describe('login', () => {
  it('rejects a missing employee ID or password with 400', async () => {
    const a = await runFull(auth.login, loginReq('', PASSWORD));
    const b = await runFull(auth.login, loginReq('EMP001', ''));

    expect(a.error.statusCode).toBe(400);
    expect(b.error.statusCode).toBe(400);
    // Neither should have touched the session.
    expect(a.cookies).toEqual({});
    expect(b.cookies).toEqual({});
  });

  it('gives an unknown employee ID the same message as a wrong password', async () => {
    await makeLoginUser();

    const unknown = await runFull(auth.login, loginReq('NOPE', PASSWORD));
    const wrong   = await runFull(auth.login, loginReq('EMP001', 'Wrong1Password'));

    expect(unknown.error.statusCode).toBe(401);
    expect(wrong.error.statusCode).toBe(401);
    // A different message for either case is a user-enumeration oracle.
    expect(unknown.error.message).toBe(wrong.error.message);
  });

  it('records a failed login for an unknown ID with no user attached', async () => {
    await runFull(auth.login, loginReq('GHOST', PASSWORD));

    const log = await waitForAudit('FAILED_LOGIN');
    expect(log.userId).toBeNull();
    expect(log.metadata).toMatchObject({ employeeId: 'GHOST', reason: 'unknown_employee_id' });
  });

  it('records a failed login against the real user when the password is wrong', async () => {
    const user = await makeLoginUser();

    await runFull(auth.login, loginReq('EMP001', 'Wrong1Password'));

    const log = await waitForAudit('FAILED_LOGIN');
    expect(log.userId).toBe(user.id);
    expect(log.metadata).toMatchObject({ reason: 'wrong_password' });
  });

  it('refuses an over-long password without consulting the database', async () => {
    const user = await makeLoginUser();

    const out = await runFull(auth.login, loginReq('EMP001', 'A1'.repeat(100)));

    expect(out.error.statusCode).toBe(401);
    // The length guard exists so a megabyte of input never reaches bcrypt. If it were
    // removed, the attempt would be counted like any other failure.
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.loginAttempts).toBe(0);
  });

  it('counts each failed attempt on the user row', async () => {
    const user = await makeLoginUser();

    await runFull(auth.login, loginReq('EMP001', 'Wrong1Password'));
    await runFull(auth.login, loginReq('EMP001', 'Wrong1Password'));

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.loginAttempts).toBe(2);
  });

  it('locks the account after ten failures and reports the wait in minutes', async () => {
    const user = await makeLoginUser();

    for (let i = 0; i < 10; i++) {
      await runFull(auth.login, loginReq('EMP001', 'Wrong1Password'));
    }

    const locked = await prisma.user.findUnique({ where: { id: user.id } });
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    // The counter resets when the lock is applied, so the next window starts clean.
    expect(locked.loginAttempts).toBe(0);

    // The correct password must not open a locked account.
    const out = await runFull(auth.login, loginReq('EMP001', PASSWORD));
    expect(out.error.statusCode).toBe(429);
    expect(out.error.message).toMatch(/try again in \d+ minutes?/);
    expect(out.cookies).toEqual({});
  });

  it('lets a user back in once the lock has expired', async () => {
    const user = await makeLoginUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000), loginAttempts: 4 },
    });

    const out = await runFull(auth.login, loginReq('EMP001', PASSWORD));

    expect(out.error).toBeNull();
    // A successful login clears the slate rather than leaving the stale counter behind.
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.loginAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it('blocks an unapproved account without opening a session', async () => {
    const user = await makeLoginUser({ pendingApproval: true });

    const out = await runFull(auth.login, loginReq('EMP001', PASSWORD));

    expect(out.error.statusCode).toBe(403);
    expect(out.cookies).toEqual({});
    // The refresh row is written after these gates; a token here would mean a rejected
    // account still holds a usable seven-day session.
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('blocks a deactivated account without opening a session', async () => {
    const user = await makeLoginUser({ isActive: false });

    const out = await runFull(auth.login, loginReq('EMP001', PASSWORD));

    expect(out.error.statusCode).toBe(403);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('issues both cookies and a stored refresh token on success', async () => {
    const store = await makeStore({ storeCode: 'GOM', storeName: 'Gombe' });
    const user = await makeLoginUser({ storeId: store.id, email: 'ada@example.com' });

    const out = await runFull(auth.login, loginReq('EMP001', PASSWORD));

    expect(out.error).toBeNull();
    expect(out.body.user).toEqual({
      id: user.id,
      employeeId: 'EMP001',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'STORE_MANAGER',
      storeId: store.id,
      mustChangePassword: false,
      store: { id: store.id, storeCode: 'GOM', storeName: 'Gombe' },
    });
    // The password hash must never travel back to the client.
    expect(JSON.stringify(out.body)).not.toContain('$2b$');

    expect(out.cookies.accessToken.options).toMatchObject({ httpOnly: true });
    expect(out.cookies.refreshToken.options).toMatchObject({ httpOnly: true });

    const stored = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].token).toBe(out.cookies.refreshToken.value);
  });

  it('prunes the user\'s expired refresh tokens as it issues a new one', async () => {
    const user = await makeLoginUser();
    const other = await makeUser({ employeeId: 'EMP999' });
    await prisma.refreshToken.createMany({
      data: [
        { token: 'stale-a', userId: user.id, expiresAt: new Date(Date.now() - 1000) },
        { token: 'live-a',  userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
        { token: 'stale-b', userId: other.id, expiresAt: new Date(Date.now() - 1000) },
      ],
    });

    await runFull(auth.login, loginReq('EMP001', PASSWORD));

    const mine = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    // The live session on another device survives; only the expired row goes.
    expect(mine.map(t => t.token)).toContain('live-a');
    expect(mine.map(t => t.token)).not.toContain('stale-a');
    // Pruning is scoped to the user who logged in.
    expect(await prisma.refreshToken.count({ where: { userId: other.id } })).toBe(1);
  });
});

describe('refresh', () => {
  /** Log in and hand back the user plus the refresh token they were given. */
  async function establishSession(overrides = {}) {
    const user = await makeLoginUser(overrides);
    const out = await runFull(auth.login, loginReq('EMP001', PASSWORD));
    return { user, token: out.cookies.refreshToken.value };
  }

  it('rejects a request with no refresh cookie', async () => {
    const out = await runFull(auth.refresh, { cookies: {} });
    expect(out.error.statusCode).toBe(401);
  });

  it('clears both cookies when the token is unknown', async () => {
    const out = await runFull(auth.refresh, { cookies: { refreshToken: 'never-issued' } });

    expect(out.error.statusCode).toBe(401);
    expect(out.cleared).toEqual(expect.arrayContaining(['accessToken', 'refreshToken']));
  });

  it('rejects an expired token', async () => {
    const user = await makeLoginUser();
    await prisma.refreshToken.create({
      data: { token: 'expired-one', userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });

    const out = await runFull(auth.refresh, { cookies: { refreshToken: 'expired-one' } });

    expect(out.error.statusCode).toBe(401);
    expect(out.cleared).toContain('refreshToken');
  });

  it('rotates the token: the old one stops working and a new one is issued', async () => {
    const { user, token } = await establishSession();

    const out = await runFull(auth.refresh, { cookies: { refreshToken: token } });

    expect(out.error).toBeNull();
    expect(out.body.user.id).toBe(user.id);

    const newToken = out.cookies.refreshToken.value;
    expect(newToken).not.toBe(token);

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows.map(r => r.token)).toEqual([newToken]);

    // Replaying the old token now fails, which is the point of rotating.
    const replay = await runFull(auth.refresh, { cookies: { refreshToken: token } });
    expect(replay.error.statusCode).toBe(401);
  });

  it('lets exactly one of two simultaneous refreshes win', async () => {
    const { token } = await establishSession();

    // This is the optimistic lock in `deleteMany(...).count === 0`. Both requests read
    // the same row, both try to delete it, and only the one whose delete reported a row
    // may issue a new session. Without that check both would succeed and the browser
    // would keep whichever cookie landed second while a second live session existed.
    const results = await Promise.all([
      runFull(auth.refresh, { cookies: { refreshToken: token } }),
      runFull(auth.refresh, { cookies: { refreshToken: token } }),
    ]);

    const winners = results.filter(r => r.error === null);
    const losers  = results.filter(r => r.error !== null);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].error.statusCode).toBe(401);

    // And the database agrees: one session, the winner's.
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(winners[0].cookies.refreshToken.value);
  });

  it('revokes the session when the account has been deactivated mid-session', async () => {
    const { user, token } = await establishSession();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const out = await runFull(auth.refresh, { cookies: { refreshToken: token } });

    expect(out.error.statusCode).toBe(401);
    expect(out.cleared).toContain('refreshToken');
    // The stored token is destroyed, not merely refused, so the session cannot be
    // resurrected by reactivating the account later.
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('revokes the session when approval is withdrawn mid-session', async () => {
    const { user, token } = await establishSession();
    await prisma.user.update({ where: { id: user.id }, data: { pendingApproval: true } });

    const out = await runFull(auth.refresh, { cookies: { refreshToken: token } });

    expect(out.error.statusCode).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('reflects a role change made since the access token was signed', async () => {
    const { user, token } = await establishSession();
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });

    const out = await runFull(auth.refresh, { cookies: { refreshToken: token } });

    // Refresh reads the user fresh, so a demotion or promotion takes effect within one
    // access-token lifetime rather than at the end of the seven-day refresh window.
    expect(out.body.user.role).toBe('ADMIN');
  });
});

describe('logout', () => {
  it('deletes the presented token and clears both cookies', async () => {
    const user = await makeLoginUser();
    const other = await makeUser({ employeeId: 'EMP999' });
    await prisma.refreshToken.createMany({
      data: [
        { token: 'mine',   userId: user.id,  expiresAt: new Date(Date.now() + 86_400_000) },
        { token: 'theirs', userId: other.id, expiresAt: new Date(Date.now() + 86_400_000) },
      ],
    });

    const out = await runFull(auth.logout, { cookies: { refreshToken: 'mine' } });

    expect(out.error).toBeNull();
    expect(out.cleared).toEqual(expect.arrayContaining(['accessToken', 'refreshToken']));
    const left = await prisma.refreshToken.findMany();
    expect(left.map(t => t.token)).toEqual(['theirs']);
  });

  it('succeeds when there is no session to end', async () => {
    const out = await runFull(auth.logout, { cookies: {} });

    // Logging out of nothing is not an error — the client's intent is already satisfied.
    expect(out.error).toBeNull();
    expect(out.cleared).toContain('refreshToken');
  });
});

describe('changePassword', () => {
  async function callChange(user, body) {
    return runFull(auth.changePassword, { user: { id: user.id }, body });
  }

  it('rejects a wrong current password without changing anything', async () => {
    const user = await makeLoginUser();

    const out = await callChange(user, { currentPassword: 'Wrong1Password', newPassword: 'Brand2New' });

    expect(out.error.statusCode).toBe(401);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.passwordHash).toBe(user.passwordHash);
  });

  it('rejects a new password that fails the strength rules', async () => {
    const user = await makeLoginUser();

    const out = await callChange(user, { currentPassword: PASSWORD, newPassword: 'short' });

    expect(out.error.statusCode).toBe(400);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.passwordHash).toBe(user.passwordHash);
  });

  it('changes the password, clears the forced-change flag, and ends every other session', async () => {
    const user = await makeLoginUser({ mustChangePassword: true });
    const other = await makeUser({ employeeId: 'EMP999' });
    await prisma.refreshToken.createMany({
      data: [
        { token: 'phone',  userId: user.id,  expiresAt: new Date(Date.now() + 86_400_000) },
        { token: 'laptop', userId: user.id,  expiresAt: new Date(Date.now() + 86_400_000) },
        { token: 'theirs', userId: other.id, expiresAt: new Date(Date.now() + 86_400_000) },
      ],
    });

    const out = await callChange(user, { currentPassword: PASSWORD, newPassword: 'Brand2New' });

    expect(out.error).toBeNull();

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('Brand2New', after.passwordHash)).toBe(true);
    expect(await bcrypt.compare(PASSWORD, after.passwordHash)).toBe(false);

    // Every session belonging to this user goes, including the one that made the
    // request — that is what makes a password change useful after a compromise.
    const left = await prisma.refreshToken.findMany();
    expect(left.map(t => t.token)).toEqual(['theirs']);
  });

  it('does not touch the password when the session revocation would fail', async () => {
    const user = await makeLoginUser();
    // Both writes are in one $transaction, so a failure in either must roll back the
    // other. Deleting the user out from under the update is the cheapest way to make
    // the transaction fail after the bcrypt work has already been done.
    await prisma.user.delete({ where: { id: user.id } });

    const out = await callChange(user, { currentPassword: PASSWORD, newPassword: 'Brand2New' });

    expect(out.error).not.toBeNull();
  });
});

describe('updateProfile', () => {
  async function callUpdate(user, body) {
    return runFull(auth.updateProfile, { user: { id: user.id }, body });
  }

  it('rejects an empty submission', async () => {
    const user = await makeLoginUser();

    // A blank name is not a change, so this must not be treated as one.
    const out = await callUpdate(user, { name: '   ' });

    expect(out.error.statusCode).toBe(400);
    expect(out.error.message).toMatch(/No changes/i);
  });

  it('rejects a malformed email address', async () => {
    const user = await makeLoginUser();

    const out = await callUpdate(user, { email: 'not-an-email' });

    expect(out.error.statusCode).toBe(400);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.email).toBeNull();
  });

  it('saves trimmed values and reports which fields changed', async () => {
    const user = await makeLoginUser();

    const out = await callUpdate(user, { name: '  Ada Lovelace  ', email: ' ada@example.com ', phone: ' 0812 ' });

    expect(out.error).toBeNull();
    expect(out.body).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', phone: '0812' });
    expect(out.body.passwordHash).toBeUndefined();

    const log = await waitForAudit('UPDATE_PROFILE');
    expect(log.metadata.fields).toEqual(expect.arrayContaining(['name', 'email', 'phone']));
  });

  it('clears an email when an empty string is sent', async () => {
    const user = await makeLoginUser({ email: 'ada@example.com' });

    const out = await callUpdate(user, { email: '' });

    expect(out.error).toBeNull();
    expect(out.body.email).toBeNull();
  });

  it('turns a duplicate email into a 409 rather than a 500', async () => {
    await makeUser({ employeeId: 'EMP999', email: 'taken@example.com' });
    const user = await makeLoginUser();

    const out = await callUpdate(user, { email: 'taken@example.com' });

    // The unique constraint is the database's; the controller has to translate P2002
    // into something a form can display.
    expect(out.error.statusCode).toBe(409);
    expect(out.error.message).toMatch(/Email address is already in use/);
  });
});

describe('validatePassword', () => {
  // Pure function, but it is the single gate on every password in the system — the
  // admin reset path imports it too — so each rule gets its own case.
  const cases = [
    ['', /at least 8 characters/],
    [null, /at least 8 characters/],
    ['Ab1', /at least 8 characters/],
    [`Ab1${'x'.repeat(126)}`, /longer than 128/],
    ['lowercase1', /uppercase/],
    ['UPPERCASE1', /lowercase/],
    ['NoDigitsHere', /one number/],
  ];

  it.each(cases)('rejects %j', (password, message) => {
    expect(() => auth.validatePassword(password)).toThrow(message);
  });

  it('accepts a password meeting every rule', () => {
    expect(() => auth.validatePassword('Correct1Horse')).not.toThrow();
  });

  it('accepts exactly 128 characters and rejects 129', () => {
    const base = (n) => `Aa1${'x'.repeat(n - 3)}`;
    expect(() => auth.validatePassword(base(128))).not.toThrow();
    expect(() => auth.validatePassword(base(129))).toThrow(/longer than 128/);
  });
});

/**
 * Audit writes are fire-and-forget, so the row can land after the handler returns.
 * Polls rather than sleeping a fixed amount.
 */
async function waitForAudit(action, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.auditLog.findFirst({ where: { action }, orderBy: { id: 'desc' } });
    if (row) return row;
    if (Date.now() > deadline) throw new Error(`No ${action} audit row appeared within ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, 25));
  }
}
