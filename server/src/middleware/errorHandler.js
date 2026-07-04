import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred';

  // Build response
  const response = {
    error: message,
  };

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
