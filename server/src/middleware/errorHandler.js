import { env } from '../config/env.js';
import { logger, errorDetails, requestStore } from '../config/logger.js';
import { reportError } from '../services/errorReporter.js';

// Prisma's known request errors carry a `code` and are really client mistakes, not
// server faults. Left unmapped they fall through as 500s, so a request for a row that
// was already deleted reads as "our end broke" instead of "not found".
const PRISMA_STATUS = new Map([
  ['P2025', { status: 404, message: 'The requested record no longer exists' }],
  ['P2002', { status: 409, message: 'A record with these details already exists' }],
  ['P2003', { status: 400, message: 'Related record not found' }],
  ['P2034', { status: 409, message: 'That action conflicted with another update. Please try again' }],
]);

// Supabase/PgBouncer drops idle connections, so any query can fail with a
// connection-level error that a retry would fix. admin/shared.js withDbRetry and
// areaManagerController.withRetry already answer those with a 503, but every path
// without a retry wrapper — the refresh-token write at the end of login, all of the
// store routes — fell through here as a 500 "something went wrong on our end". That
// tells the user the server is broken when it only needed another attempt, and the
// login page treats 500 as fatal-looking while 503 is the status it already retries.
const CONNECTION_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

function isPrismaConnectionError(err) {
  // clientVersion is set on every Prisma error class and on nothing else, so the
  // message sniff below cannot misfire on an ordinary application bug.
  if (!err?.clientVersion) return false;
  // Carries no `code` at all — it is raised only when the server is unreachable.
  if (err.name === 'PrismaClientInitializationError') return true;
  if (CONNECTION_PRISMA_CODES.has(err.code)) return true;
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('connect') || msg.includes('econnreset') || msg.includes('socket');
}

export function errorHandler(err, req, res, _next) {
  const prismaMapped = PRISMA_STATUS.get(err.code);
  if (prismaMapped && !err.statusCode) {
    err.statusCode = prismaMapped.status;
    err.message    = prismaMapped.message;
    err.name       = 'AppError'; // treated as operational so the message survives
  } else if (!err.statusCode && isPrismaConnectionError(err)) {
    err.statusCode = 503;
    err.message    = 'We are having trouble connecting right now. Please try again in a moment';
    err.name       = 'AppError';
  }

  const statusCode = err.statusCode || 500;
  const isOperational = err instanceof AppError || err.name === 'AppError';

  // Log all 5xx errors with full context — never shown to the user. The requestId
  // comes from the async context, so this line can be tied to the access-log line
  // for the same request.
  if (statusCode >= 500) {
    logger.error(`Unhandled ${statusCode} on ${req.method} ${req.path}`, {
      status: statusCode,
      ...errorDetails(err),
    });

    // Forwards the same event to an external sink if one is configured, and does
    // nothing otherwise. Not awaited, so the response below is never delayed by it.
    // The try/catch is not redundant defensiveness: this is the last handler in the
    // process, and a throw here would leave the request with no response at all.
    try {
      const context = requestStore.getStore();
      reportError(err, {
        status: statusCode,
        method: req.method,
        path: req.path,
        requestId: context?.requestId ?? null,
        userId: context?.userId ?? null,
      });
    } catch { /* reporting must never cost a response */ }
  }

  // User-facing message: operational errors keep their message, unexpected errors get a generic one
  const userMessage = (statusCode >= 500 && !isOperational)
    ? 'Something went wrong on our end. Please try again in a moment'
    : (err.message || 'Something went wrong. Please try again');

  const response = { error: userMessage };

  // Stack trace only in development (never in production)
  if (env.server.nodeEnv === 'development') {
    response.stack = err.stack;
  }

  if (res.headersSent) return;
  res.status(statusCode).json(response);
}

export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
