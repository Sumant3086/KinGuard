// logger.js — structured logging with automatic request correlation.
//
// The problem this solves: when a store manager reports "it failed around 3pm", the
// old console.* output gave no way to find their request. There was no request id, no
// user id, no level, and no machine-readable structure, so production logs were an
// undifferentiated text firehose.
//
// No logging dependency here on purpose. Everything below is stdout plus Node's
// built-in AsyncLocalStorage; a library would add a transitive tree for behaviour we
// can express in a few dozen lines, and keeping it in-house means PII redaction stays
// something we control rather than configure.
//
// AsyncLocalStorage is what makes this usable: requestContext middleware opens a store
// per request, and every await inside that request keeps it, so a controller five calls
// deep can log with the request id attached without threading `req` through.

import { AsyncLocalStorage } from 'node:async_hooks';

export const requestStore = new AsyncLocalStorage();

// `silent` is above every level, so nothing clears it — used by tests that exercise
// error paths on purpose, and available as an operational escape hatch.
const LEVELS = { debug: 20, info: 30, warn: 40, error: 50, silent: Infinity };

const IS_PROD = process.env.NODE_ENV === 'production';
// Explicit LOG_LEVEL wins; otherwise prod stays at info and dev shows everything.
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (IS_PROD ? LEVELS.info : LEVELS.debug);

// Values that must never reach a log line even if a caller passes them by mistake.
// Logs are retained and searchable, so a leaked hash or token is a lasting problem.
const REDACT = new Set([
  'password', 'passwordHash', 'newPassword', 'currentPassword',
  'token', 'refreshToken', 'accessToken', 'jwt', 'authorization', 'cookie', 'secret',
]);

function redact(details) {
  if (!details || typeof details !== 'object') return details;
  const safe = {};
  for (const [k, v] of Object.entries(details)) {
    safe[k] = REDACT.has(k) ? '[redacted]' : v;
  }
  return safe;
}

const DEV_COLOURS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };

function emit(level, message, details) {
  if (LEVELS[level] < threshold) return;

  // Whatever the current request put in scope, if we are inside one.
  const context = requestStore.getStore();
  const safeDetails = redact(details);

  if (IS_PROD) {
    // One JSON object per line — greppable, and parseable by any log tool.
    process.stdout.write(`${JSON.stringify({
      level,
      time: new Date().toISOString(),
      message,
      ...context,
      ...safeDetails,
    })}\n`);
    return;
  }

  // Development: keep it readable for a human watching a terminal.
  const reqId = context?.requestId ? ` \x1b[90m(${context.requestId.slice(0, 8)})\x1b[0m` : '';
  const extra = safeDetails && Object.keys(safeDetails).length ? ` ${JSON.stringify(safeDetails)}` : '';
  process.stdout.write(`${DEV_COLOURS[level]}${level.toUpperCase().padEnd(5)}\x1b[0m${reqId} ${message}${extra}\n`);
}

export const logger = {
  debug: (message, details) => emit('debug', message, details),
  info:  (message, details) => emit('info',  message, details),
  warn:  (message, details) => emit('warn',  message, details),
  error: (message, details) => emit('error', message, details),

  /**
   * Attach extra fields to the current request's log context. Anything added here
   * appears on every subsequent log line for this request — used by the auth
   * middleware to stamp the user id once it knows who is calling.
   */
  addContext(fields) {
    const context = requestStore.getStore();
    if (context) Object.assign(context, fields);
  },
};

/** Pull the message and stack off an unknown throwable without assuming it is an Error. */
export function errorDetails(err) {
  if (!(err instanceof Error)) return { err: String(err) };
  return IS_PROD
    ? { err: err.message, errName: err.name }
    : { err: err.message, errName: err.name, stack: err.stack };
}

export default logger;
