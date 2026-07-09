import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import prisma from '../config/prisma.js';

export async function login(req, res, next) {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      throw new AppError('Employee ID and password are required', 400);
    }

    // Find user — retry once on transient DB connection errors (common on cold start)
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { employeeId },
        include: { store: true },
      });
    } catch (dbErr) {
      // On first request after server restart Prisma may not be fully ready
      try {
        await prisma.$connect();
        user = await prisma.user.findUnique({
          where: { employeeId },
          include: { store: true },
        });
      } catch {
        throw new AppError('Service is starting up. Please try again in a moment.', 503);
      }
    }

    if (!user) {
      throw new AppError('Employee ID or password is incorrect', 401);
    }

    if (!user.isActive) {
      throw new AppError('This account is inactive. Contact your administrator', 401);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError('Employee ID or password is incorrect', 401);
    }

    // Create JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        storeId: user.storeId,
      },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn }
    );

    // Create audit log
    await createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user.id,
    });

    // Return user info and token
    res.json({
      token,
      user: {
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        store: user.store
          ? {
              id: user.store.id,
              storeCode: user.store.storeCode,
              storeName: user.store.storeName,
            }
          : null,
      },
    });
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

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      store: user.store
        ? {
            id: user.store.id,
            storeCode: user.store.storeCode,
            storeName: user.store.storeName,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
}
