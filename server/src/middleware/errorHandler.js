import { env } from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const isOperational = err instanceof AppError;

  // Log unexpected server errors (not intentional 4xx or AppError 5xx)
  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.path} → ${statusCode}:`, err);
  }

  // In production, hide internal error details from non-operational errors
  // to prevent accidental leakage of stack traces, DB messages, etc.
  const message = (statusCode >= 500 && !isOperational && env.server.nodeEnv === 'production')
    ? 'An unexpected error occurred. Please try again later.'
    : (err.message || 'An unexpected error occurred');

  const response = { error: message };

  // Include stack trace only in development
  if (env.server.nodeEnv === 'development') {
    response.stack = err.stack;
  }

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
