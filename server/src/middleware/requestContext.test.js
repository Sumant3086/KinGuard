import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestContext } from './requestContext.js';
import { requestStore } from '../config/logger.js';

function makeReqRes(overrides = {}) {
  const handlers = {};
  const req = {
    method: 'GET',
    path: '/api/store/inventory',
    get: () => undefined,
    ...overrides,
  };
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    on: (event, cb) => { handlers[event] = cb; },
  };
  return { req, res, finish: () => handlers.finish?.() };
}

describe('requestContext', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  // Without this, re-spying an already-spied process.stdout.write in the next
  // beforeEach reuses the existing mock and carries its recorded calls over.
  afterEach(() => { vi.restoreAllMocks(); });

  it('generates a request id and exposes it on the response', () => {
    const { req, res } = makeReqRes();

    requestContext(req, res, () => {});

    const [header, value] = res.setHeader.mock.calls[0];
    expect(header).toBe('X-Request-Id');
    expect(value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('makes the context visible to code running inside the request', () => {
    const { req, res } = makeReqRes();
    let seen;

    requestContext(req, res, () => { seen = requestStore.getStore(); });

    expect(seen).toMatchObject({ method: 'GET', path: '/api/store/inventory' });
    expect(seen.requestId).toBeTruthy();
  });

  it('reuses a well-formed inbound x-request-id so one request keeps one identity', () => {
    const { req, res } = makeReqRes({ get: () => 'upstream-abc-123' });

    requestContext(req, res, () => {});

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'upstream-abc-123');
  });

  it('rejects a malformed inbound id rather than letting it into log lines', () => {
    // Newlines would let a caller forge extra log entries.
    const { req, res } = makeReqRes({ get: () => 'bad\nid INJECTED' });

    requestContext(req, res, () => {});

    const value = res.setHeader.mock.calls[0][1];
    expect(value).not.toContain('INJECTED');
    expect(value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an over-long inbound id', () => {
    const { req, res } = makeReqRes({ get: () => 'a'.repeat(65) });

    requestContext(req, res, () => {});

    expect(res.setHeader.mock.calls[0][1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs a line when the response finishes', () => {
    const { req, res, finish } = makeReqRes();

    requestContext(req, res, () => {});
    finish();

    expect(process.stdout.write).toHaveBeenCalled();
    expect(String(process.stdout.write.mock.calls.at(-1)[0])).toContain('/api/store/inventory');
  });

  it('stays quiet for successful health checks', () => {
    const { req, res, finish } = makeReqRes({ path: '/api/health' });

    requestContext(req, res, () => {});
    finish();

    expect(process.stdout.write).not.toHaveBeenCalled();
  });

  it('still logs a failing health check', () => {
    const { req, res, finish } = makeReqRes({ path: '/api/health' });
    res.statusCode = 503;

    requestContext(req, res, () => {});
    finish();

    expect(process.stdout.write).toHaveBeenCalled();
  });

  it('logs 5xx at error level and 4xx at warn level', () => {
    for (const [status, expected] of [[500, 'ERROR'], [404, 'WARN'], [200, 'INFO']]) {
      process.stdout.write.mockClear();
      const { req, res, finish } = makeReqRes();
      res.statusCode = status;

      requestContext(req, res, () => {});
      finish();

      expect(String(process.stdout.write.mock.calls.at(-1)[0])).toContain(expected);
    }
  });
});
