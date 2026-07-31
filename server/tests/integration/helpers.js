// Shared plumbing for the integration suite.
//
// These tests talk to a real database. They deliberately do not mock prisma, express,
// or anything else — the whole point is to run the SQL that ships and see what
// PostgreSQL does with it.

import guard from './guard.js';
import prisma from '../../src/config/prisma.js';
import { sInvalidate } from '../../src/services/serverCache.js';

// The config's globalSetup runs this too, but that is a separate process and only
// applies when the run went through vitest.integration.config.js. This call is the one
// that actually stands between a stray `vitest tests/integration/...` and a truncated
// production database.
guard();

// Truncation order does not matter with CASCADE, but RESTART IDENTITY does: several
// assertions below compare ids, and a shared sequence across files would make them
// depend on execution order.
//
// TRUNCATE is also the only way to empty "AuditLog" — a BEFORE DELETE row trigger
// rejects every DELETE against it (see the 20260726000003_features migration), and
// TRUNCATE does not fire row triggers. If that ever changes, this helper is where it
// will surface first.
const TABLES = [
  'AuditLog',
  'BatchDeadlineExtension',
  'AreaManagerReview',
  'InventoryRecord',
  'RefreshToken',
  'CycleSchedule',
  'UploadBatch',
  'SchedulerLock',
  'User',
  'Store',
];

export async function resetDb() {
  // createAuditLog is fire-and-forget by design, so a write from the previous test can
  // still be in flight. Truncating underneath it either logs a foreign key error (noise)
  // or — because RESTART IDENTITY hands the same user ids to the next test — lands a
  // stray row in the next test's audit log. A short settle costs a few milliseconds and
  // removes both.
  await new Promise((resolve) => setTimeout(resolve, 25));

  const list = TABLES.map(t => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  clearCaches();
}

// The server cache is process-global and survives between tests, so a dashboard read in
// one test would otherwise be served from another test's data. Keys are listed
// explicitly because sInvalidate takes exact keys, not prefixes.
export function clearCaches(ids = {}) {
  const keys = ['admin:dashboard', 'admin:notifications'];
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...(ids.extra ?? [])]) {
    keys.push(
      `store:dashboard:${id}`,
      `store:notifications:${id}`,
      `am:stores:${id}`,
      `am:batches:${id}`,
      `am:notifications:${id}`,
    );
  }
  sInvalidate(...keys);
}

// A minimal express-shaped response. Controllers only ever call status/json/setHeader
// on the paths these tests cover; anything else would throw loudly rather than pass
// silently, which is the behaviour we want from a stub.
export function mockRes() {
  const captured = { statusCode: 200, body: undefined, headers: {}, cookies: {}, cleared: [] };
  const res = {
    status(code) { captured.statusCode = code; return res; },
    json(payload) { captured.body = payload; return res; },
    send(payload) { captured.body = payload; return res; },
    setHeader(k, v) { captured.headers[k] = v; return res; },
    // The auth controller carries the whole session in cookies, so a test that only
    // sees the JSON body cannot tell a successful login from a failed one.
    cookie(name, value, options) { captured.cookies[name] = { value, options }; return res; },
    clearCookie(name) { captured.cleared.push(name); delete captured.cookies[name]; return res; },
  };
  return { res, captured };
}

/**
 * Invoke a controller the way the router would, and surface whatever it produced.
 * An error passed to next() is re-thrown so a test can assert on it with rejects.
 */
export async function run(handler, req) {
  const { res, captured } = mockRes();
  let forwarded = null;
  await handler(req, res, (err) => { forwarded = err; });
  if (forwarded) throw forwarded;
  return captured.body;
}

/** Same as run(), but returns everything the response captured, not just the body. */
export async function runFull(handler, req) {
  const { res, captured } = mockRes();
  let forwarded = null;
  await handler(req, res, (err) => { forwarded = err; });
  return { ...captured, error: forwarded };
}

/** Same as run(), but returns the error instead of the body. */
export async function runExpectingError(handler, req) {
  const { res } = mockRes();
  let forwarded = null;
  await handler(req, res, (err) => { forwarded = err; });
  return forwarded;
}

// ── Fixture builders ──────────────────────────────────────────────────────────
// Passwords are never verified in these tests, so the hash is a constant rather than a
// real bcrypt call — hashing 6 users per file would dominate the suite's runtime.
const FAKE_HASH = '$2b$10$0000000000000000000000000000000000000000000000000000';

export async function makeUser(overrides = {}) {
  return prisma.user.create({
    data: {
      employeeId: `EMP${Math.random().toString(36).slice(2, 10)}`,
      name: 'Test User',
      passwordHash: FAKE_HASH,
      role: 'STORE_MANAGER',
      ...overrides,
    },
  });
}

export async function makeStore(overrides = {}) {
  return prisma.store.create({
    data: {
      storeCode: `S${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      storeName: 'Test Store',
      ...overrides,
    },
  });
}

export async function makeBatch(uploadedBy, overrides = {}) {
  return prisma.uploadBatch.create({
    data: {
      originalFileName: 'cycle.xlsx',
      uploadedBy,
      inventoryDate: new Date('2026-07-01T00:00:00Z'),
      status: 'COMPLETED',
      ...overrides,
    },
  });
}

/**
 * Create inventory rows from terse tuples so a test reads as data, not as setup.
 * Each row: { code, sys, phys, category, remarks, status }
 * `difference` is computed here exactly as the app computes it, so a row seeded as
 * SUBMITTED looks identical to one the app submitted.
 */
export async function makeRecords(batchId, storeId, rows) {
  const data = rows.map((r, i) => {
    const sys = r.sys === undefined ? 100 : r.sys;
    const phys = r.phys === undefined ? null : r.phys;
    const difference = (sys === null || phys === null)
      ? null
      : parseFloat((phys - sys).toFixed(4));
    return {
      batchId,
      storeId,
      materialCode: r.code ?? `MAT${String(i + 1).padStart(3, '0')}`,
      materialName: r.name ?? `Item ${i + 1}`,
      systemQuantity: sys,
      physicalQuantity: phys,
      difference,
      shrinkageCategory: r.category ?? null,
      remarks: r.remarks ?? null,
      status: r.status ?? 'PENDING',
      isRepeat: r.isRepeat ?? false,
      submittedAt: r.status === 'SUBMITTED' ? new Date() : null,
    };
  });
  await prisma.inventoryRecord.createMany({ data });
  return prisma.inventoryRecord.findMany({
    where: { batchId, storeId },
    orderBy: { materialCode: 'asc' },
  });
}

/** A req object shaped the way the auth middleware leaves it. */
export function storeReq(user, store, extra = {}) {
  return {
    user: { id: user.id, role: 'STORE_MANAGER', storeId: store.id, name: user.name, email: user.email ?? null, store: { id: store.id, storeCode: store.storeCode, storeName: store.storeName } },
    params: {},
    query: {},
    body: {},
    ...extra,
  };
}

export { prisma };
