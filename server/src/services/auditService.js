import prisma from '../config/prisma.js';

export async function createAuditLog({ userId, action, entityType, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entityType, entityId, metadata },
    });
  } catch (error) {
    // Log the action name so it's easy to find in production logs what was lost
    console.error(`[audit] Failed to write log for action=${action}:`, error.message);
  }
}
