import { env } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
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
