import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import { invalidateUserCache } from '../middleware/auth.js';
import prisma from '../config/prisma.js';

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

// ── Cold-start DB retry (Supabase pooler drops idle connections) ───────────
async function findUserForLogin(employeeId) {
  try {
    return await prisma.user.findUnique({
      where: { employeeId },
      include: { store: true },
    });
  } catch (firstErr) {
    console.warn('[auth] First login query failed, retrying after reconnect:', firstErr.message);
    try {
      await new Promise(r => setTimeout(r, 500));
      await prisma.$connect();
      return await prisma.user.findUnique({
        where: { employeeId },
        include: { store: true },
      });
    } catch (retryErr) {
      console.error('[auth] DB unavailable during login retry:', retryErr.message);
      throw new AppError('Unable to reach the database. Please try again in a moment.', 503);
    }
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────

export async function login(req, res, next) {
  try {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) {
      throw new AppError('Employee ID and password are required', 400);
    }

    const user = await findUserForLogin(employeeId.trim());

    // Always run bcrypt (or dummy) before revealing any account state — prevents timing attacks
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234');

    if (!user || !isPasswordValid) {
      throw new AppError('Employee ID or password is incorrect', 401);
    }

    if (user.pendingApproval) {
      throw new AppError('This account is pending administrator approval. Please contact your admin.', 403);
    }
    if (!user.isActive) {
      throw new AppError('This account is inactive. Contact your administrator', 401);
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
      throw new AppError('No refresh token', 401);
    }

    // Look up the stored token
    const stored = await prisma.refreshToken.findUnique({
      where: { token: incomingToken },
      include: { user: { include: { store: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      clearCookies(res);
      throw new AppError('Refresh token expired or invalid', 401);
    }

    const { user } = stored;
    if (!user.isActive) {
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
      clearCookies(res);
      throw new AppError('Account is inactive', 401);
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

export async function getCurrentUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { store: true },
    });
    if (!user) throw new AppError('User not found', 404);
    res.json(buildUserPayload(user));
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new AppError('currentPassword and newPassword are required', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new AppError('User not found', 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError('Current password is incorrect', 401);

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

// ── Shared password validator (also imported by adminController) ───────────
export function validatePassword(password) {
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }
  if (!/[A-Z]/.test(password)) {
    throw new AppError('Password must contain at least one uppercase letter', 400);
  }
  if (!/[a-z]/.test(password)) {
    throw new AppError('Password must contain at least one lowercase letter', 400);
  }
  if (!/[0-9]/.test(password)) {
    throw new AppError('Password must contain at least one number', 400);
  }
}
