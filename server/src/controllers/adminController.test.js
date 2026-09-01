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
  store: { findMany: vi.fn(), findUnique: vi.fn() },
  inventoryRecord: { findUnique: vi.fn(), update: vi.fn() },
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
const { createAuditLog } = await import('../services/auditService.js');

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

  it('does not force a password change when admin resets password', async () => {
    await callAndCatch(admin.updateUser, req({ password: 'NewPassw0rd!' }));

    expect(prismaMock.user.update.mock.calls[0][0].data)
      .toMatchObject({ mustChangePassword: false });
  });

  it('leaves sessions alone when the edit does not touch the password', async () => {
    await callAndCatch(admin.updateUser, req({ name: 'Sam Renamed' }));

    expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(transactionOps()).toHaveLength(1);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(transactionOps()).toHaveLength(2);
  });

  it('does not force a password change when admin resets password', async () => {
    await callAndCatch(admin.updateUser, req({ password: 'NewPassw0rd!' }));

    expect(prismaMock.user.update.mock.calls[0][0].data)
      .toMatchObject({ mustChangePassword: false });
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

// The upload is the riskiest input in the system: it writes the ground truth every
// store's count is measured against, and a store cannot correct a bad one. These drive
// the real CSV parser and column matcher with actual file buffers rather than mocking
// them, so header aliasing and the blank/zero rule are exercised end to end.
describe('previewUpload', () => {
  beforeEach(() => {
    Object.values(prismaMock).forEach((v) => {
      if (typeof v.mockReset === 'function') v.mockReset();
      else Object.values(v).forEach((f) => f.mockReset());
    });
    prismaMock.store.findMany.mockResolvedValue([{ storeCode: 'S1', storeName: 'Store One' }]);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  /** Run previewUpload over a CSV string and return the response body. */
  async function preview(csv) {
    const next = vi.fn();
    const res = { json: vi.fn() };
    await admin.previewUpload({
      user: { id: 1, role: 'ADMIN' },
      file: { originalname: 'stock.csv', mimetype: 'text/csv', buffer: Buffer.from(csv) },
      body: { inventoryDate: '2026-07-30' },
    }, res, next);
    if (next.mock.calls.length) throw next.mock.calls[0][0];
    return res.json.mock.calls[0][0];
  }

  const HEADER = 'Plant Code,Material Code,Material Description,System Quantity';

  it('keeps an empty system quantity cell blank instead of turning it into zero', async () => {
    const body = await preview(`${HEADER}\nS1,M1,Widget,\n`);

    // A blank means "no figure supplied"; 0 would tell the store the system says none.
    expect(body.preview[0].systemQuantity).toBeNull();
    expect(body.preview[0].status).toBe('valid');
  });

  it('treats a whitespace-only cell as blank', async () => {
    const body = await preview(`${HEADER}\nS1,M1,Widget,"   "\n`);

    expect(body.preview[0].systemQuantity).toBeNull();
  });

  it('keeps an explicit zero as a real figure', async () => {
    const body = await preview(`${HEADER}\nS1,M1,Widget,0\n`);

    expect(body.preview[0].systemQuantity).toBe(0);
    expect(body.preview[0].status).toBe('valid');
  });

  it('accepts a missing system quantity column entirely', async () => {
    const body = await preview('Plant Code,Material Code,Material Description\nS1,M1,Widget\n');

    expect(body.preview[0].systemQuantity).toBeNull();
    expect(body.preview[0].status).toBe('valid');
  });

  it('parses decimal quantities', async () => {
    const body = await preview(`${HEADER}\nS1,M1,Widget,12.5\n`);

    expect(body.preview[0].systemQuantity).toBe(12.5);
  });

  it.each([
    ['SYS'],
    ['System Stock'],
    ['SYSTEM QUANTITY'],
    ['system_quantity'],
  ])('recognises %s as the system quantity column', async (heading) => {
    const body = await preview(
      `Plant Code,Material Code,Material Description,${heading}\nS1,M1,Widget,7\n`,
    );

    expect(body.preview[0].systemQuantity).toBe(7);
  });

  it('flags a non-numeric quantity as an error rather than silently zeroing it', async () => {
    const body = await preview(`${HEADER}\nS1,M1,Widget,abc\n`);

    expect(body.preview[0].status).toBe('error');
    expect(body.preview[0].message).toMatch(/not a number/i);
    expect(body.statistics.errors).toBe(1);
  });

  it('flags a negative quantity as an error', async () => {
    const body = await preview(`${HEADER}\nS1,M1,Widget,-5\n`);

    expect(body.preview[0].status).toBe('error');
    expect(body.preview[0].message).toMatch(/negative/i);
  });

  it('flags a missing plant code and a missing material code', async () => {
    const body = await preview(`${HEADER}\n,M1,Widget,5\nS1,,Widget,5\n`);

    expect(body.preview[0].message).toMatch(/Plant Code/i);
    expect(body.preview[1].message).toMatch(/Material Code/i);
    expect(body.statistics.errors).toBe(2);
  });

  it('warns rather than fails when the plant code is new', async () => {
    const body = await preview(`${HEADER}\nS9,M1,Widget,5\n`);

    expect(body.preview[0].status).toBe('warning');
    expect(body.preview[0].message).toMatch(/new plant/i);
    expect(body.statistics.warnings).toBe(1);
  });

  it('rejects an over-long plant code', async () => {
    const body = await preview(`${HEADER}\n${'X'.repeat(51)},M1,Widget,5\n`);

    expect(body.preview[0].status).toBe('error');
    expect(body.preview[0].message).toMatch(/too long/i);
  });

  it('falls back to the material code when the description is missing', async () => {
    const body = await preview(`${HEADER}\nS1,M1,,5\n`);

    expect(body.preview[0].materialName).toBe('M1');
  });

  it('rejects a file with no data rows', async () => {
    await expect(preview(`${HEADER}\n`)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a request with no file at all', async () => {
    const next = vi.fn();
    await admin.previewUpload({ user: { id: 1 }, body: { inventoryDate: '2026-07-30' } }, { json: vi.fn() }, next);

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('requires an inventory date', async () => {
    const next = vi.fn();
    await admin.previewUpload({
      user: { id: 1 },
      file: { originalname: 'a.csv', mimetype: 'text/csv', buffer: Buffer.from(`${HEADER}\nS1,M1,W,1\n`) },
      body: {},
    }, { json: vi.fn() }, next);

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('counts valid, warning and error rows separately', async () => {
    const body = await preview(
      `${HEADER}\nS1,M1,Widget,5\nS9,M2,Gadget,5\nS1,,Broken,5\n`,
    );

    expect(body.statistics).toMatchObject({ valid: 1, warnings: 1, errors: 1 });
  });
});

// The override screen is the only correction path for a system quantity once a store
// has submitted, now that a store can supply that figure itself. A wrong baseline
// makes every shrinkage number computed from it wrong, so this route has to move the
// variance with it and has to leave a trail.
describe('overrideInventoryRecord', () => {
  const RECORD = {
    id: 5, storeId: 3, status: 'SUBMITTED',
    systemQuantity: 100, physicalQuantity: 90, difference: -10,
    remarks: null, shrinkageCategory: null,
  };

  beforeEach(() => {
    Object.values(prismaMock).forEach((v) => {
      if (typeof v.mockReset === 'function') v.mockReset();
      else Object.values(v).forEach((f) => f.mockReset());
    });
    createAuditLog.mockClear(); // shared across describes — only this block's calls matter
    prismaMock.inventoryRecord.findUnique.mockResolvedValue(RECORD);
    prismaMock.inventoryRecord.update.mockResolvedValue({ ...RECORD, store: {} });
    prismaMock.store.findUnique.mockResolvedValue({ areaManagerId: null });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const req = (body) => ({ user: { id: 1, role: 'ADMIN' }, params: { id: '5' }, body });

  /** The `data` object handed to prisma.inventoryRecord.update. */
  function updateData() {
    return prismaMock.inventoryRecord.update.mock.calls[0][0].data;
  }

  it('corrects the system quantity', async () => {
    const { err } = await callAndCatch(admin.overrideInventoryRecord, req({ systemQuantity: 120 }));

    expect(err).toBeNull();
    expect(updateData().systemQuantity).toBe(120);
  });

  it('moves the variance when only the baseline changes', async () => {
    await callAndCatch(admin.overrideInventoryRecord, req({ systemQuantity: 120 }));

    // 90 counted against a corrected book stock of 120 is a shortage of 30, not 10.
    expect(updateData().difference).toBe(-30);
  });

  it('computes the variance against the corrected baseline when both change at once', async () => {
    await callAndCatch(admin.overrideInventoryRecord, req({ systemQuantity: 120, physicalQuantity: 115 }));

    expect(updateData().difference).toBe(-5);
  });

  it('clears the system quantity back to blank and blanks the variance with it', async () => {
    await callAndCatch(admin.overrideInventoryRecord, req({ systemQuantity: null }));

    expect(updateData().systemQuantity).toBeNull();
    expect(updateData().difference).toBeNull();
  });

  it('rejects a negative system quantity', async () => {
    const { err } = await callAndCatch(admin.overrideInventoryRecord, req({ systemQuantity: -1 }));

    expect(err?.statusCode).toBe(400);
    expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric system quantity', async () => {
    const { err } = await callAndCatch(admin.overrideInventoryRecord, req({ systemQuantity: 'abc' }));

    expect(err?.statusCode).toBe(400);
  });

  it('leaves the system quantity untouched when the field is absent', async () => {
    await callAndCatch(admin.overrideInventoryRecord, req({ remarks: 'note' }));

    expect(updateData().systemQuantity).toBeUndefined();
  });

  it('refuses to mark a record submitted while its baseline is blank', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue({ ...RECORD, systemQuantity: null, status: 'PENDING' });

    const { err } = await callAndCatch(admin.overrideInventoryRecord, req({ status: 'SUBMITTED' }));

    expect(err?.statusCode).toBe(400);
    expect(err?.message).toMatch(/system stock/i);
    expect(prismaMock.inventoryRecord.update).not.toHaveBeenCalled();
  });

  it('allows submission once the same call supplies the missing baseline', async () => {
    prismaMock.inventoryRecord.findUnique.mockResolvedValue({ ...RECORD, systemQuantity: null, status: 'PENDING' });

    const { err } = await callAndCatch(
      admin.overrideInventoryRecord,
      req({ systemQuantity: 100, status: 'SUBMITTED' }),
    );

    expect(err).toBeNull();
    expect(updateData().status).toBe('SUBMITTED');
  });

  it('records the previous system quantity in the audit trail', async () => {
    await callAndCatch(admin.overrideInventoryRecord, req({ systemQuantity: 120 }));

    expect(createAuditLog.mock.calls[0][0].metadata.before.systemQuantity).toBe(100);
  });
});
