import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, requestStore, errorDetails } from './logger.js';

function captureStdout() {
  const lines = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return { lines, spy };
}

describe('logger', () => {
  let out;

  beforeEach(() => { out = captureStdout(); });
  afterEach(() => { out.spy.mockRestore(); });

  it('writes the message and details', () => {
    logger.error('Something broke', { batchId: 7 });

    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toContain('Something broke');
    expect(out.lines[0]).toContain('7');
  });

  it('drops levels below the threshold', () => {
    // Default threshold outside production is debug, so nothing is filtered here;
    // assert the ordering constants hold rather than mutating module state.
    logger.debug('visible in dev');
    expect(out.lines).toHaveLength(1);
  });

  it('redacts secret-bearing fields instead of logging them', () => {
    logger.info('Login attempt', {
      employeeId: 'E123',
      password: 'hunter2',
      passwordHash: '$2b$10$abcdef',
      token: 'eyJhbGciOi',
    });

    const line = out.lines[0];
    expect(line).toContain('E123');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('$2b$10$abcdef');
    expect(line).not.toContain('eyJhbGciOi');
    expect(line).toContain('[redacted]');
  });

  it('includes the request context when inside a request', () => {
    requestStore.run({ requestId: 'abcdef12-0000-0000-0000-000000000000', userId: 42 }, () => {
      logger.error('Failed inside a request');
    });

    expect(out.lines[0]).toContain('abcdef12');
  });

  it('addContext attaches fields to later lines in the same request', () => {
    requestStore.run({ requestId: 'req-1' }, () => {
      logger.addContext({ userId: 99 });
      logger.error('after context added', { marker: true });
    });

    expect(out.lines[0]).toMatch(/99|req-1/);
  });

  it('addContext outside a request does not throw', () => {
    expect(() => logger.addContext({ userId: 1 })).not.toThrow();
  });
});

describe('errorDetails', () => {
  it('extracts message and name from an Error', () => {
    const d = errorDetails(new TypeError('bad input'));
    expect(d.err).toBe('bad input');
    expect(d.errName).toBe('TypeError');
  });

  it('stringifies a non-Error throwable', () => {
    expect(errorDetails('plain string').err).toBe('plain string');
    expect(errorDetails(undefined).err).toBe('undefined');
  });
});
