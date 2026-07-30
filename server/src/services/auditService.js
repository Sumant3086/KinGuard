import prisma from '../config/prisma.js';
import { logger, errorDetails } from '../config/logger.js';

export async function createAuditLog({ userId, action, entityType, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entityType, entityId, metadata },
    });
  } catch (error) {
    // Log the action name so it's easy to find in production logs what was lost
    logger.error('Failed to write audit log', { action, ...errorDetails(error) });
  }
}
