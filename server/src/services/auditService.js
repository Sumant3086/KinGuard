import prisma from '../config/prisma.js';

export async function createAuditLog({ userId, action, entityType, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
