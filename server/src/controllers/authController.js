import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import { invalidateUserCache } from '../middleware/auth.js';
import prisma from '../config/prisma.js';

// Generated once at startup for timing-safe dummy comparison when the employee ID
// does not exist in the database. Prevents user-enumeration via response time.
// A fresh random hash is used each restart so it never appears in source or logs.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);

// ── Cookie configuration ───────────────────────────────────────────────────
const IS_PROD = env.server.nodeEnv === 'production';

// Access token: short-lived (15 min), sent on every request
const ACCESS_COOKIE = 'accessToken';
const ACCESS_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Refresh token: long-lived (7 days), used only to obtain new access tokens
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieOpts(maxAgeMs, path = '/') {
  return {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? 'Strict' : 'Lax',
    maxAge:   maxAgeMs,
    path,
  };
}

function clearCookies(res) {
  res.clearCookie(ACCESS_COOKIE,  cookieOpts(0));
  res.clearCookie(REFRESH_COOKIE, cookieOpts(0));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function signAccessToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, storeId: user.storeId },
    env.jwt.secret,
    { expiresIn: '15m' }
  );
}

function buildUserPayload(user) {
  return {
    id:         user.id,
    employeeId: user.employeeId,
    name:       user.name,
    email:      user.email || null,
    role:       user.role,
    storeId:    user.storeId,
    mustChangePassword: user.mustChangePassword ?? false,
    store: user.store
      ? { id: user.store.id, storeCode: user.store.storeCode, storeName: user.store.storeName }
      : null,
  };
}

async function issueRefreshToken(userId, res) {
  const token = randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  // Create the new token and prune this user's expired tokens in one round-trip
  await Promise.all([
    prisma.refreshToken.create({ data: { token, userId, expiresAt } }),
    prisma.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }),
  ]);

  res.cookie(REFRESH_COOKIE, token, cookieOpts(REFRESH_TTL_MS));
  return token;
}

// ── Login attempt lockout ──────────────────────────────────────────────────
// DB-backed per-account lockout so it survives server restarts and deploys.
// loginAttempts and lockedUntil are stored on the User row itself.
const LOCKOUT_MAX_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS    = 15 * 60 * 1000; // 15 minutes

async function checkDbLockout(user) {
  if (!user?.lockedUntil) return;
  if (user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new AppError(`Too many failed attempts. Please try again in ${mins} minute${mins !== 1 ? 's' : ''}.`, 429);
  }
}

async function recordDbFailure(userId) {
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { loginAttempts: { increment: 1 } },
      select: { loginAttempts: true },
    });
    if (updated.loginAttempts >= LOCKOUT_MAX_ATTEMPTS) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil:   new Date(Date.now() + LOCKOUT_WINDOW_MS),
          loginAttempts: 0,
        },
      });
    }
  } catch {
    // Non-fatal — lockout tracking should never block the login response path
  }
}

async function clearDbFailures(userId) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { loginAttempts: 0, lockedUntil: null },
    });
  } catch {
    // Non-fatal
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────

export async function login(req, res, next) {
  try {
    const employeeId = typeof req.body.employeeId === 'string' ? req.body.employeeId : '';
    const password   = typeof req.body.password   === 'string' ? req.body.password   : '';
    if (!employeeId || !password) {
      throw new AppError('Please enter your Employee ID and password', 400);
    }
    if (password.length > 128) throw new AppError('Incorrect Employee ID or password', 401);

    // Look up user — up to 3 attempts with growing delays for Supabase pooler cold-start.
    // Delays: immediate → 500 ms → 1200 ms (total max wait ~1.7 s before 503).
    let user;
    const delays = [0, 500, 1200];
    let lastErr;
    for (const delay of delays) {
      if (delay > 0) {
        console.warn(`[auth] Login DB query failed, retrying in ${delay}ms:`, lastErr?.message);
        await new Promise(r => setTimeout(r, delay));
      }
      try {
        user = await prisma.user.findUnique({
          where: { employeeId: employeeId.trim() },
          include: { store: true },
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) {
      console.error('[auth] DB unavailable after all retries:', lastErr.message);
      throw new AppError('We are having trouble connecting right now. Please try again in a moment', 503);
    }

    // Check DB-backed lockout before running bcrypt (avoids wasting CPU on locked accounts)
    if (user) await checkDbLockout(user);

    // Always run bcrypt before revealing any account state — prevents user enumeration via timing.
    // For non-existent accounts, compare against DUMMY_HASH (a random hash generated at startup)
    // so the response time matches a real failed login and attackers cannot enumerate valid IDs.
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_HASH);

    if (!user || !isPasswordValid) {
      if (user) await recordDbFailure(user.id);
      throw new AppError('Incorrect Employee ID or password', 401);
    }

    await clearDbFailures(user.id);

    if (user.pendingApproval) {
      throw new AppError('Your account is awaiting administrator approval. Please contact your admin', 403);
    }
    if (!user.isActive) {
      throw new AppError('Your account has been deactivated. Contact your administrator to regain access', 403);
    }

    // Issue access token as HttpOnly cookie
    const accessToken = signAccessToken(user);
    res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(ACCESS_TTL_MS));

    // Issue refresh token stored in DB + HttpOnly cookie
    await issueRefreshToken(user.id, res);

    createAuditLog({
      userId: user.id, action: 'LOGIN', entityType: 'USER', entityId: user.id,
    }).catch(() => {});

    // Return only user data — token is in cookie, not in response body
    res.json({ user: buildUserPayload(user) });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const incomingToken = req.cookies?.[REFRESH_COOKIE];
    if (!incomingToken) {
      throw new AppError('Session not found. Please sign in again', 401);
    }

    // Look up the stored token
    const stored = await prisma.refreshToken.findUnique({
      where: { token: incomingToken },
      include: { user: { include: { store: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      clearCookies(res);
      throw new AppError('Your session has expired. Please sign in again', 401);
    }

    const { user } = stored;
    if (!user.isActive) {
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
      clearCookies(res);
      throw new AppError('Your account has been deactivated. Contact your administrator', 401);
    }

    // Rotate: delete old token, issue new one (one-time use)
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    await issueRefreshToken(user.id, res);

    // Issue new access token
    const accessToken = signAccessToken(user);
    res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(ACCESS_TTL_MS));

    res.json({ user: buildUserPayload(user) });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const incomingToken = req.cookies?.[REFRESH_COOKIE];
    if (incomingToken) {
      // Delete from DB — best-effort, don't fail the logout if DB is down
      await prisma.refreshToken.deleteMany({ where: { token: incomingToken } }).catch(() => {});
    }
    clearCookies(res);
    res.json({ message: 'Logged out' });
  } catch (error) {
    next(error);
  }
}

export function getCurrentUser(req, res) {
  // req.user is populated by the auth middleware (from DB or 30s cache).
  // We return it directly to avoid a redundant DB round-trip on every page load.
  res.json(buildUserPayload(req.user));
}

export async function changePassword(req, res, next) {
  try {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword     = typeof req.body.newPassword     === 'string' ? req.body.newPassword     : '';
    if (!currentPassword || !newPassword) {
      throw new AppError('Both your current and new password are required', 400);
    }
    if (currentPassword.length > 128) throw new AppError('The current password you entered is incorrect', 401);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new AppError('Account not found', 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError('The current password you entered is incorrect', 401);

    validatePassword(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    invalidateUserCache(user.id);

    createAuditLog({
      userId: user.id, action: 'CHANGE_PASSWORD', entityType: 'USER', entityId: user.id,
    }).catch(() => {});

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateProfile(req, res, next) {
  try {
    const { name, email, phone } = req.body;
    const userId = req.user.id;

    const data = {};
    if (name !== undefined) data.name = name?.trim() || undefined;
    if (email !== undefined) {
      const trimmed = email?.trim() || null;
      if (trimmed && !EMAIL_REGEX.test(trimmed)) {
        throw new AppError('Please enter a valid email address', 400);
      }
      data.email = trimmed;
    }
    if (phone !== undefined) data.phone = phone?.trim() || null;

    if (Object.keys(data).length === 0) {
      throw new AppError('No changes were submitted', 400);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, employeeId: true, name: true, email: true, phone: true, role: true, storeId: true, mustChangePassword: true, store: true },
    });

    invalidateUserCache(userId);

    createAuditLog({
      userId, action: 'UPDATE_PROFILE', entityType: 'USER', entityId: userId,
      metadata: { fields: Object.keys(data) },
    }).catch(() => {});

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2002') {
      const field = error.meta?.target?.includes('email') ? 'Email address' : 'Field';
      return next(new AppError(`${field} is already in use`, 409));
    }
    next(error);
  }
}

// ── Shared password validator (also imported by adminController) ───────────
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    throw new AppError('Password must be at least 8 characters long', 400);
  }
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters long', 400);
  }
  if (password.length > 128) {
    throw new AppError('Password cannot be longer than 128 characters', 400);
  }
  if (!/[A-Z]/.test(password)) {
    throw new AppError('Password must include at least one uppercase letter (A–Z)', 400);
  }
  if (!/[a-z]/.test(password)) {
    throw new AppError('Password must include at least one lowercase letter (a–z)', 400);
  }
  if (!/[0-9]/.test(password)) {
    throw new AppError('Password must include at least one number (0–9)', 400);
  }
}
