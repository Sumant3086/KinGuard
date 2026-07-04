import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';

const prisma = new PrismaClient();

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401);
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, env.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { store: true },
    });

    if (!user || !user.isActive) {
      throw new AppError('Invalid or inactive account', 401);
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
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid authentication token', 401));
    } else {
      next(error);
    }
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
