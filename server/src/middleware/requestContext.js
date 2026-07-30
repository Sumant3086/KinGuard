// requestContext.js — gives every request an id and logs how it finished.
//
// Runs before the routes so that anything logged during a request — including the
// error handler — carries the same requestId. The id also goes back on the response as
// X-Request-Id, so a user reporting a failure can quote it and we can find the exact
// request in the logs.

import { randomUUID } from 'node:crypto';
import { logger, requestStore } from '../config/logger.js';

// Health checks fire every few seconds from the platform and uptime monitors. Logging
// them buries real traffic, and they carry no diagnostic value when they succeed.
const QUIET_PATHS = new Set(['/api/health']);

export function requestContext(req, res, next) {
  // Honour an upstream id if there is one so a request keeps a single identity across
  // hops, but only if it looks sane — this value ends up in every log line, and an
  // attacker-supplied one could otherwise inject newlines and forge log entries.
  const inbound = req.get('x-request-id');
  const requestId = (inbound && /^[\w-]{1,64}$/.test(inbound)) ? inbound : randomUUID();

  res.setHeader('X-Request-Id', requestId);

  // userId is filled in later by the auth middleware, once the token is verified.
  const context = { requestId, method: req.method, path: req.path };

  requestStore.run(context, () => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      if (QUIET_PATHS.has(req.path) && res.statusCode < 400) return;

      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      // Server faults are errors, client mistakes are warnings, everything else is
      // routine. This is what makes "show me only real problems" a filter rather
      // than a manual scan.
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      logger[level](`${req.method} ${req.path} ${res.statusCode}`, {
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      });
    });

    next();
  });
}
