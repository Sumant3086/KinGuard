// Helpers and limits shared by the admin controllers.
//
// These were file-local in adminController.js. Splitting that file by concern means the
// pieces several concerns rely on — the connection retry wrapper, the cache invalidation
// fan-out, the validation ceilings — need somewhere to live that none of them owns.

import { randomBytes } from 'crypto';
import { AppError } from '../../middleware/errorHandler.js';
import { logger, errorDetails } from '../../config/logger.js';
import prisma from '../../config/prisma.js';
import { sInvalidate } from '../../services/serverCache.js';

// Hard cap on rows returned by report/export endpoints.
export const EXPORT_ROW_LIMIT = 10_000;

// Max records per bulk override operation
export const BULK_OVERRIDE_LIMIT = 500;

// Field length limits for uploaded inventory data
export const MAX_MATERIAL_CODE_LEN = 50;

export const MAX_MATERIAL_NAME_LEN = 200;

export const MAX_REMARKS_LEN       = 500;

export const MAX_STORE_CODE_LEN    = 50;

// Whitelist of valid audit log action values for the filter endpoint
export const VALID_AUDIT_ACTIONS = new Set([
  'BULK_OVERRIDE_RECORDS',
  'LOGIN', 'FAILED_LOGIN', 'CHANGE_PASSWORD', 'UPDATE_PROFILE',
  'CREATE_STORE', 'DELETE_STORE', 'UPDATE_STORE', 'FORCE_DELETE_STORE', 'BULK_DELETE_STORES',
  'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'APPROVE_USER', 'REJECT_USER',
  'BULK_DELETE_USERS', 'BATCH_USER_IMPORT',
  'UPLOAD_INVENTORY', 'DOWNLOAD_REPORT', 'DOWNLOAD_ADMIN_INVENTORY_EXPORT',
  'DOWNLOAD_INVENTORY_PDF', 'DOWNLOAD_REPORT_PDF',
  'GRANT_STORE_EXTENSION', 'SEND_BATCH_REMINDERS',
  'SUBMIT_INVENTORY', 'UPDATE_INVENTORY', 'DOWNLOAD_INVENTORY', 'REPEAT_DISCREPANCY',
  'AM_APPROVE', 'AM_RETURN', 'AM_EDIT_RECORD',
  'BATCH_ASSIGN_AREA_MANAGER', 'ASSIGN_AREA_MANAGER',
  'OVERRIDE_RECORD', 'UNLOCK_STORE_SUBMISSION',
  'DOWNLOAD_BATCH_EXPORT', 'DOWNLOAD_BATCH_EXPORT_PDF',
  'DELETE_BATCH', 'CLOSE_BATCH', 'UPDATE_BATCH_DEADLINE',
  'BATCH_CREATE_USERS',
  'DOWNLOAD_EXECUTIVE_SUMMARY',
  'CREATE_CYCLE_SCHEDULE', 'UPDATE_CYCLE_SCHEDULE', 'DELETE_CYCLE_SCHEDULE',
]);

// Bust the cached dashboards/notifications of every store in a cycle, plus their
// area managers. Admin-only keys are not enough: when a cycle is deleted or locked
// the stores and AMs keep serving it from their own cached payloads.
export async function invalidateBatchAudience(batchId) {
  const rows = await prisma.inventoryRecord.findMany({
    where: { batchId },
    select: { storeId: true, store: { select: { areaManagerId: true } } },
    distinct: ['storeId'],
  }).catch(() => []);

  const amIds = [...new Set(rows.map(r => r.store?.areaManagerId).filter(Boolean))];
  sInvalidate(
    ...rows.flatMap(r => [`store:dashboard:${r.storeId}`, `store:notifications:${r.storeId}`]),
    ...amIds.flatMap(id => [`am:batches:${id}`, `am:notifications:${id}`]),
  );
}

// Generate a secure random temp password that satisfies validatePassword() rules.
// Uses only unambiguous characters (no I/l/0/O) so it's easy to communicate.
export function generateTempPassword() {
  const upper  = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;

  // Use separate byte pools so character selection and shuffle have independent randomness
  const charBytes    = randomBytes(8);
  const shuffleBytes = randomBytes(16);

  let pw = [
    upper[charBytes[0]  % upper.length],
    lower[charBytes[1]  % lower.length],
    digits[charBytes[2] % digits.length],
    '!',
  ];
  for (let i = 3; i < 8; i++) pw.push(all[charBytes[i] % all.length]);

  // Fisher-Yates shuffle with independent random bytes
  for (let i = pw.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

// Prisma error codes that indicate a dropped or timed-out connection.
// Only these warrant a reconnect attempt — query/validation errors should not be retried.
const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

function isConnectionError(err) {
  if (RETRYABLE_PRISMA_CODES.has(err.code)) return true;
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('connect') || msg.includes('econnreset') || msg.includes('socket');
}

// Supabase / PgBouncer drops idle connections after ~5 min.
// This wrapper retries once after reconnect, but only for connection-level failures.
// Query errors, validation errors, and constraint violations are re-thrown immediately.
export async function withDbRetry(fn) {
  try {
    return await fn();
  } catch (firstErr) {
    if (!isConnectionError(firstErr)) throw firstErr;
    logger.warn('DB connection lost, reconnecting', errorDetails(firstErr));
    try {
      await new Promise(r => setTimeout(r, 400));
      await prisma.$connect();
      return await fn();
    } catch (retryErr) {
      logger.error('DB retry also failed', errorDetails(retryErr));
      throw new AppError('We are having trouble connecting to the database. Please wait a moment and try again', 503);
    }
  }
}

/** Validate and parse a date string from user input. Throws 400 on invalid format. */
export function parseUserDate(value, fieldName) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new AppError(`Invalid ${fieldName} — expected a valid ISO date string`, 400);
  return d;
}

export const VALID_INV_STATUSES = new Set(['PENDING', 'SUBMITTED']);

export const VALID_DISCREPANCIES = new Set(['shortage', 'excess', 'matched']);
