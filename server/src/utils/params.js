import { AppError } from '../middleware/errorHandler.js';

/**
 * Parse a string as a positive integer (≥ 1).
 * - Returns undefined when val is absent (undefined / null / '').
 * - Throws AppError(400) when val is present but not a valid positive integer.
 * Only pure digit strings are accepted; "5abc" is rejected.
 */
export function parseId(val, name = 'id') {
  if (val === undefined || val === null || val === '') return undefined;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) {
    throw new AppError(`Invalid ${name}: must be a positive integer`, 400);
  }
  const n = parseInt(str, 10);
  if (n < 1) throw new AppError(`Invalid ${name}: must be a positive integer`, 400);
  return n;
}

/**
 * Like parseId but throws when val is absent — for required route parameters.
 */
export function requireId(val, name = 'id') {
  if (val === undefined || val === null || val === '') {
    throw new AppError(`${name} is required`, 400);
  }
  return parseId(val, name);
}

/**
 * Parse page number (≥ 1). Returns defaultVal when absent.
 */
export function parsePage(val, defaultVal = 1) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) throw new AppError('Invalid page: must be a positive integer', 400);
  const n = parseInt(str, 10);
  if (n < 1) throw new AppError('Invalid page: must be a positive integer', 400);
  return n;
}

/**
 * Parse page size (1–max). Returns defaultVal when absent.
 */
export function parsePageSize(val, defaultVal = 50, max = 500) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) throw new AppError('Invalid pageSize: must be a positive integer', 400);
  const n = parseInt(str, 10);
  if (n < 1 || n > max) {
    throw new AppError(`Invalid pageSize: must be between 1 and ${max}`, 400);
  }
  return n;
}

/**
 * Parse an arbitrary positive integer query/body param with a custom max.
 * Returns defaultVal when absent.
 */
export function parseIntParam(val, name, defaultVal, min = 1, max = Infinity) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) throw new AppError(`Invalid ${name}: must be a positive integer`, 400);
  const n = parseInt(str, 10);
  if (n < min || (max !== Infinity && n > max)) {
    throw new AppError(`Invalid ${name}: must be between ${min} and ${max}`, 400);
  }
  return n;
}
