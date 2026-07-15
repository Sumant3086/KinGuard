import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError, errorHandler } from './errorHandler.js';

describe('AppError', () => {
  it('stores message and statusCode', () => {
    const err = new AppError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err instanceof Error).toBe(true);
  });

  it('defaults statusCode to 500', () => {
    const err = new AppError('Oops');
    expect(err.statusCode).toBe(500);
  });

  it('sets name to AppError', () => {
    const err = new AppError('x', 400);
    expect(err.name).toBe('AppError');
  });
});

describe('errorHandler', () => {
  let req, res, next;

  beforeEach(() => {
    req  = { method: 'GET', path: '/test' };
    res  = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    next = vi.fn();
  });

  it('sends operational AppError message as-is in any environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new AppError('Store not found', 404);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Store not found' }));

    process.env.NODE_ENV = originalEnv;
  });

  it('non-operational errors get status 500', () => {
    const err = new Error('Some internal error');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('non-operational 5xx response has an error field', () => {
    const err = new Error('DB failure');
    errorHandler(err, req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('4xx AppErrors always expose their message', () => {
    const err = new AppError('Invalid input', 400);
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid input' }));
  });
});
