import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';
import prisma from '../config/prisma.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  const token = authHeader.substring(7);

  // Step 1: verify JWT — any JWT error returns 401, never 500
  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.secret);
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }

  // Step 2: guard against malformed payload before hitting Prisma
  if (!decoded?.userId || typeof decoded.userId !== 'number') {
    return next(new AppError('Invalid authentication token', 401));
  }

  // Step 3: DB lookup — isolate so Prisma errors never become unhandled 500s
  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { store: true },
    });

    if (!user || !user.isActive) {
      return next(new AppError('Invalid or inactive account', 401));
    }

    req.user = {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      store: user.store,
    };

    next();
  } catch (dbError) {
    console.error('[auth] DB error during token validation:', dbError.message);
    next(new AppError('Authentication service temporarily unavailable. Please try again.', 503));
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Access forbidden', 403));
    }

    next();
  };
}

export function requireStoreManager(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.user.role !== 'STORE_MANAGER') {
    return next(new AppError('Access forbidden', 403));
  }

  if (!req.user.storeId) {
    return next(new AppError('Store assignment required', 403));
  }

  next();
}
