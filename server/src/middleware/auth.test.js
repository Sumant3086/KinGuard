// Authorization boundary tests.
//
// These pin the invariants where a regression is a security incident rather than a
// bug: who is allowed to be authenticated at all, and which role gates each route.
// Several of these cases correspond to fixes already made by hand in this repo
// (revoked approval, deactivated accounts), which until now had nothing holding them
// in place.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const findUnique = vi.fn();
vi.mock('../config/prisma.js', () => ({
  default: { user: { findUnique: (...a) => findUnique(...a) } },
}));

const jwtVerify = vi.fn();
class JsonWebTokenError extends Error {}
vi.mock('jsonwebtoken', () => ({
  default: { verify: (...a) => jwtVerify(...a), JsonWebTokenError },
  JsonWebTokenError,
}));

vi.mock('../config/env.js', () => ({ env: { jwt: { secret: 'x'.repeat(32) } } }));

const {
  authenticate, requireRole, requireStoreManager, requireAreaManager, invalidateUserCache,
} = await import('./auth.js');
const { AppError } = await import('./errorHandler.js');

const ACTIVE_USER = {
  id: 7, employeeId: 'E7', name: 'Sam', email: null, role: 'STORE_MANAGER',
  storeId: 3, store: { id: 3 }, isActive: true, pendingApproval: false,
  mustChangePassword: false,
};

function makeReq(overrides = {}) {
  return { cookies: {}, headers: {}, ...overrides };
}

/** Run authenticate and return the error passed to next(), or null if it passed. */
async function runAuth(req) {
  const next = vi.fn();
  await authenticate(req, {}, next);
  return { err: next.mock.calls[0]?.[0] ?? null, next };
}

describe('authenticate', () => {
  beforeEach(() => {
    findUnique.mockReset();
    jwtVerify.mockReset();
    invalidateUserCache(ACTIVE_USER.id);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('rejects a request with no token', async () => {
    const { err } = await runAuth(makeReq());
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('rejects a token that fails verification', async () => {
    jwtVerify.mockImplementation(() => { throw new JsonWebTokenError('bad signature'); });

    const { err } = await runAuth(makeReq({ cookies: { accessToken: 'forged' } }));

    expect(err.statusCode).toBe(401);
  });

  it('propagates a non-JWT verification failure rather than reporting it as a bad session', async () => {
    // A misconfigured secret is our bug, not the user's; it must stay a 500 so it is
    // visible instead of silently logging everyone out.
    jwtVerify.mockImplementation(() => { throw new TypeError('secret must be a string'); });

    const { err } = await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(err).toBeInstanceOf(TypeError);
  });

  it.each([
    ['a missing userId', {}],
    ['a non-numeric userId', { userId: '7' }],
    ['a zero userId', { userId: 0 }],
    ['an out-of-range userId', { userId: 2_147_483_648 }],
  ])('rejects a token carrying %s', async (_label, payload) => {
    jwtVerify.mockReturnValue(payload);

    const { err } = await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(err.statusCode).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('accepts a valid token and attaches the user', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue(ACTIVE_USER);
    const req = makeReq({ cookies: { accessToken: 't' } });

    const { err } = await runAuth(req);

    expect(err).toBeNull();
    expect(req.user).toMatchObject({ id: 7, role: 'STORE_MANAGER', storeId: 3 });
  });

  it('never exposes the password hash on req.user', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue({ ...ACTIVE_USER, passwordHash: '$2b$10$secret' });
    const req = makeReq({ cookies: { accessToken: 't' } });

    await runAuth(req);

    expect(req.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a deactivated account even with a valid token', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue({ ...ACTIVE_USER, isActive: false });

    const { err } = await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(err.statusCode).toBe(401);
  });

  it('rejects an account whose approval was revoked after the token was issued', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue({ ...ACTIVE_USER, pendingApproval: true });

    const { err } = await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(err.statusCode).toBe(401);
  });

  it('rejects a user that no longer exists', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue(null);

    const { err } = await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(err.statusCode).toBe(401);
  });

  it('answers a database outage with 503, not a fake 401', async () => {
    // Reporting "your session expired" for an outage would log the whole site out.
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockRejectedValue(new Error('connection reset'));

    const { err } = await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(err.statusCode).toBe(503);
  });

  it('accepts a Bearer token as well as a cookie', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue(ACTIVE_USER);
    const req = makeReq({ headers: { authorization: 'Bearer abc' } });

    const { err } = await runAuth(req);

    expect(err).toBeNull();
    expect(jwtVerify).toHaveBeenCalledWith('abc', expect.any(String));
  });

  it('serves a repeat request from cache without a second database read', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue(ACTIVE_USER);

    await runAuth(makeReq({ cookies: { accessToken: 't' } }));
    await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('invalidateUserCache forces the next request back to the database', async () => {
    jwtVerify.mockReturnValue({ userId: 7 });
    findUnique.mockResolvedValue(ACTIVE_USER);

    await runAuth(makeReq({ cookies: { accessToken: 't' } }));
    invalidateUserCache(7);
    await runAuth(makeReq({ cookies: { accessToken: 't' } }));

    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('requireRole', () => {
  const run = (guard, user) => {
    const next = vi.fn();
    guard({ user }, {}, next);
    return next.mock.calls[0]?.[0] ?? null;
  };

  it('rejects an unauthenticated caller with 401', () => {
    expect(run(requireRole('ADMIN'), undefined).statusCode).toBe(401);
  });

  it('rejects a caller holding the wrong role with 403', () => {
    expect(run(requireRole('ADMIN'), { role: 'STORE_MANAGER' }).statusCode).toBe(403);
  });

  it('allows a caller holding one of the accepted roles', () => {
    expect(run(requireRole('ADMIN', 'AREA_MANAGER'), { role: 'AREA_MANAGER' })).toBeNull();
  });

  it('does not let a store manager reach an admin-only route', () => {
    expect(run(requireRole('ADMIN'), { role: 'AREA_MANAGER' }).statusCode).toBe(403);
    expect(run(requireRole('ADMIN'), { role: 'STORE_MANAGER' }).statusCode).toBe(403);
  });

  describe('requireStoreManager', () => {
    it('rejects an unauthenticated caller', () => {
      expect(run(requireStoreManager, undefined).statusCode).toBe(401);
    });

    it('rejects an area manager and an admin', () => {
      expect(run(requireStoreManager, { role: 'AREA_MANAGER', storeId: 1 }).statusCode).toBe(403);
      expect(run(requireStoreManager, { role: 'ADMIN', storeId: 1 }).statusCode).toBe(403);
    });

    it('rejects a store manager with no store assigned', () => {
      // Otherwise storeId is undefined and the tenancy filter silently matches nothing
      // — or worse, everything, if a query ever omits it.
      expect(run(requireStoreManager, { role: 'STORE_MANAGER', storeId: null }).statusCode).toBe(403);
    });

    it('allows a store manager with a store', () => {
      expect(run(requireStoreManager, { role: 'STORE_MANAGER', storeId: 3 })).toBeNull();
    });
  });

  describe('requireAreaManager', () => {
    it('rejects an unauthenticated caller', () => {
      expect(run(requireAreaManager, undefined).statusCode).toBe(401);
    });

    it('rejects a store manager and an admin', () => {
      expect(run(requireAreaManager, { role: 'STORE_MANAGER' }).statusCode).toBe(403);
      expect(run(requireAreaManager, { role: 'ADMIN' }).statusCode).toBe(403);
    });

    it('allows an area manager', () => {
      expect(run(requireAreaManager, { role: 'AREA_MANAGER' })).toBeNull();
    });
  });
});
