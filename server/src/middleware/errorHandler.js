import { env } from '../config/env.js';

// Prisma's known request errors carry a `code` and are really client mistakes, not
// server faults. Left unmapped they fall through as 500s, so a request for a row that
// was already deleted reads as "our end broke" instead of "not found".
const PRISMA_STATUS = new Map([
  ['P2025', { status: 404, message: 'The requested record no longer exists' }],
  ['P2002', { status: 409, message: 'A record with these details already exists' }],
  ['P2003', { status: 400, message: 'Related record not found' }],
  ['P2034', { status: 409, message: 'That action conflicted with another update. Please try again' }],
]);

export function errorHandler(err, req, res, _next) {
  const prismaMapped = PRISMA_STATUS.get(err.code);
  if (prismaMapped && !err.statusCode) {
    err.statusCode = prismaMapped.status;
    err.message    = prismaMapped.message;
    err.name       = 'AppError'; // treated as operational so the message survives
  }

  const statusCode = err.statusCode || 500;
  const isOperational = err instanceof AppError || err.name === 'AppError';

  // Log all 5xx errors to console with full context — never shown to the user
  if (statusCode >= 500) {
    console.error(
      `[error] ${req.method} ${req.path} → ${statusCode} | ${err.message}`,
      env.server.nodeEnv !== 'production' ? err.stack : ''
    );
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
