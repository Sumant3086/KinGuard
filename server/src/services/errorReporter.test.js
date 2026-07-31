// The reporter runs during incidents, which is exactly when nobody is watching it. Each
// case below is a way it could make an outage worse: by throwing, by blocking, by
// flooding the endpoint, or by carrying something out of the building that should have
// stayed in.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const envMock = {
  server: { nodeEnv: 'test' },
  errorReporting: { url: null, token: null },
};
vi.mock('../config/env.js', () => ({ env: envMock }));

const { reportError, _resetReporterState } = await import('./errorReporter.js');

const CONTEXT = { status: 500, method: 'GET', path: '/api/admin/dashboard', requestId: 'req-1', userId: 7 };

/** Lets the fire-and-forget promise chain settle before assertions run. */
const flush = () => new Promise((r) => setImmediate(r));

describe('reportError', () => {
  let fetchMock;

  beforeEach(() => {
    _resetReporterState();
    envMock.errorReporting.url = null;
    envMock.errorReporting.token = null;
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does nothing when no sink is configured', async () => {
    reportError(new Error('boom'), CONTEXT);
    await flush();

    // This is the default state of every checkout and of any deploy that has not chosen
    // a destination. It has to cost nothing and reach nothing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the fault to the configured sink', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

    reportError(new Error('database exploded'), CONTEXT);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/kinguard');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      service: 'kinguard-server',
      environment: 'test',
      status: 500,
      method: 'GET',
      path: '/api/admin/dashboard',
      requestId: 'req-1',
      userId: 7,
      firstOccurrence: true,
    });
    expect(body.error.message).toBe('database exploded');
    expect(body.error.name).toBe('Error');
  });

  it('sends an Authorization header only when a token is set', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

    reportError(new Error('a'), CONTEXT);
    await flush();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();

    _resetReporterState();
    envMock.errorReporting.token = 'sekret';
    reportError(new Error('a'), CONTEXT);
    await flush();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer sekret');
  });

  it('carries nothing from the request beyond route and identity', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

    reportError(new Error('failed for user'), {
      ...CONTEXT,
      // A caller passing these should not be able to leak them by accident.
      body: { password: 'hunter2' },
      cookies: { accessToken: 'ey.real.token' },
      headers: { authorization: 'Bearer live-token' },
    });
    await flush();

    const raw = fetchMock.mock.calls[0][1].body;
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('ey.real.token');
    expect(raw).not.toContain('live-token');
  });

  it('truncates a long stack rather than sending the whole thing', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';
    const err = new Error('deep');
    err.stack = ['Error: deep', ...Array.from({ length: 100 }, (_, i) => `    at frame${i}`)].join('\n');

    reportError(err, CONTEXT);
    await flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.error.stack.split('\n')).toHaveLength(12);
    expect(body.error.stack).toContain('frame0');
    expect(body.error.stack).not.toContain('frame99');
  });

  it('sends the same fault once, not once per occurrence', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

    // An outage produces the identical 5xx thousands of times. Forwarding all of them
    // buries the first one and can get the endpoint to start rejecting.
    for (let i = 0; i < 50; i++) reportError(new Error('same failure'), CONTEXT);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a different route or a different error as a different fault', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

    reportError(new Error('same failure'), CONTEXT);
    reportError(new Error('same failure'), { ...CONTEXT, path: '/api/store/inventory' });
    reportError(new Error('other failure'), CONTEXT);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops at thirty reports a minute', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

    // Distinct faults, so the dedupe window is not what is limiting this. A deploy that
    // breaks many routes at once should not turn into an outbound flood.
    for (let i = 0; i < 45; i++) reportError(new Error(`failure ${i}`), CONTEXT);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(30);
  });

  it('tells the next report through how many were dropped', async () => {
    vi.useFakeTimers();
    try {
      envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

      for (let i = 0; i < 45; i++) reportError(new Error(`failure ${i}`), CONTEXT);
      expect(fetchMock).toHaveBeenCalledTimes(30);

      // Next minute: the ceiling resets and the backlog count rides along, so a silent
      // gap in the alert stream is never mistaken for calm.
      vi.advanceTimersByTime(61_000);
      reportError(new Error('a later failure'), CONTEXT);

      const body = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
      expect(body.suppressedSinceLastReport).toBe(15);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a sink that is refusing connections', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    // Throwing here would turn one server fault into two, inside the handler whose job
    // is to produce a response.
    expect(() => reportError(new Error('boom'), CONTEXT)).not.toThrow();
    await flush();
  });

  it('survives a sink that answers with an error status', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    expect(() => reportError(new Error('boom'), CONTEXT)).not.toThrow();
    await flush();
  });

  it('does not wait for the sink before returning', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';
    // A sink that never answers must not hold up the response to the user.
    fetchMock.mockImplementation(() => new Promise(() => {}));

    const before = Date.now();
    reportError(new Error('boom'), CONTEXT);
    expect(Date.now() - before).toBeLessThan(50);
  });

  it('bounds the request with a timeout signal', async () => {
    envMock.errorReporting.url = 'https://hooks.example.com/kinguard';

    reportError(new Error('boom'), CONTEXT);
    await flush();

    // Without this, a sink that accepts connections and never replies leaks a socket
    // for every 5xx the server produces.
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
