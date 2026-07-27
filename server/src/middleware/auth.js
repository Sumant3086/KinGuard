import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';
import prisma from '../config/prisma.js';

// In-memory user cache — eliminates DB hit on every API request.
// TTL: 30 seconds — short enough that role/status changes propagate quickly.
const userCache = new Map(); // userId -> { user, expires }

function getCachedUser(id) {
  const entry = userCache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expires) { userCache.delete(id); return null; }
  return entry.user;
}

function setCachedUser(id, user) {
  userCache.set(id, { user, expires: Date.now() + 30_000 });
}

export function invalidateUserCache(id) {
  userCache.delete(id);
}

// Sweep stale entries every 15 s (half the 30 s TTL) so expired entries leave quickly.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of userCache) {
    if (now > v.expires) userCache.delete(k);
  }
}, 15_000).unref();

export async function authenticate(req, res, next) {
  // Accept the access token from either:
  //   1. HttpOnly cookie (browser clients)
  //   2. Authorization: Bearer header (API clients, testing tools)
  let token = req.cookies?.accessToken;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return next(new AppError('Please sign in to continue', 401));
  }

  // Verify JWT — JWT-specific errors return 401; unexpected errors (bad secret
  // type, algorithm mismatch, etc.) propagate as 500 so they are visible in logs.
  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.secret);
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Your session has expired. Please sign in again', 401));
    }
    return next(err); // non-JWT error — propagate as 500
  }

  if (!decoded?.userId || typeof decoded.userId !== 'number' ||
      decoded.userId < 1 || decoded.userId > 2_147_483_647) {
    return next(new AppError('Your session has expired. Please sign in again', 401));
  }

  // Serve from cache or DB
  try {
    let cached = getCachedUser(decoded.userId);

    if (!cached) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { store: true },
      });

      if (!user || !user.isActive) {
        return next(new AppError('Your account is not active. Contact your administrator', 401));
      }

      cached = {
        id:                user.id,
        employeeId:        user.employeeId,
        name:              user.name,
        email:             user.email || null,
        role:              user.role,
        storeId:           user.storeId,
        store:             user.store,
        isActive:          user.isActive,
        mustChangePassword: user.mustChangePassword,
      };
      setCachedUser(decoded.userId, cached);
    } else if (!cached.isActive) {
      userCache.delete(decoded.userId);
      return next(new AppError('Your account has been deactivated. Contact your administrator', 401));
    }

    req.user = cached;
    next();
  } catch (dbError) {
    console.error('[auth] DB error during token validation:', dbError.message);
    next(new AppError('We could not verify your session right now. Please try again in a moment', 503));
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Please sign in to continue', 401));
    if (!allowedRoles.includes(req.user.role)) return next(new AppError('You do not have permission to access this', 403));
    next();
  };
}

export function requireStoreManager(req, res, next) {
  if (!req.user)                         return next(new AppError('Please sign in to continue', 401));
  if (req.user.role !== 'STORE_MANAGER') return next(new AppError('You do not have permission to access this', 403));
  if (!req.user.storeId)                 return next(new AppError('Your account is not assigned to a store. Contact your administrator', 403));
  next();
}

export function requireAreaManager(req, res, next) {
  if (!req.user)                          return next(new AppError('Please sign in to continue', 401));
  if (req.user.role !== 'AREA_MANAGER')   return next(new AppError('You do not have permission to access this', 403));
  next();
}
