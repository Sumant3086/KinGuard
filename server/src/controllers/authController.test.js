import { describe, it, expect, vi } from 'vitest';

// Mock heavy dependencies so validatePassword (a pure function) can be tested in isolation
vi.mock('../config/prisma.js', () => ({ default: {} }));
vi.mock('../config/env.js', () => ({ env: { jwt: { secret: 'test' }, server: { nodeEnv: 'test' }, client: { url: '' } } }));
vi.mock('../services/auditService.js', () => ({ createAuditLog: vi.fn() }));
vi.mock('../middleware/auth.js', () => ({ invalidateUserCache: vi.fn() }));

import { validatePassword } from './authController.js';
import { AppError } from '../middleware/errorHandler.js';

describe('validatePassword', () => {
  it('accepts a valid password', () => {
    expect(() => validatePassword('Passw0rd!')).not.toThrow();
  });

  it('rejects password shorter than 8 characters', () => {
    expect(() => validatePassword('Abc1!')).toThrow(AppError);
  });

  it('rejects password without an uppercase letter', () => {
    expect(() => validatePassword('passw0rd!')).toThrow(AppError);
  });

  it('rejects password without a lowercase letter', () => {
    expect(() => validatePassword('PASSW0RD!')).toThrow(AppError);
  });

  it('rejects password without a number', () => {
    expect(() => validatePassword('Password!')).toThrow(AppError);
  });

  it('rejects password over 128 characters', () => {
    expect(() => validatePassword('A1' + 'a'.repeat(127))).toThrow(AppError);
  });

  it('rejects empty input', () => {
    expect(() => validatePassword('')).toThrow(AppError);
  });
});
