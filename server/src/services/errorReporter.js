// Optional outbound sink for server faults.
//
// The logger already records every 5xx, but reading it means someone opening the host's
// log viewer and knowing to look. This forwards the same events to wherever the team
// actually watches — a Slack incoming webhook, a self-hosted collector, anything that
// accepts a JSON POST.
//
// It is entirely optional. With ERROR_WEBHOOK_URL unset, reportError returns on its
// first line and costs a property read, so a deployment that has not configured one
// behaves exactly as it did before this file existed.
//
// Three rules shape everything below, because an error reporter that misbehaves during
// an incident makes the incident worse:
//   1. It never throws. A failure to report is not a second error to handle.
//   2. It never blocks the response. The request finishes whether or not the POST does.
//   3. It never floods. An outage produces thousands of identical 5xxs; sending
//      thousands of identical webhooks helps nobody and can get the endpoint to
//      rate-limit the one message that mattered.

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const TIMEOUT_MS = 5000;

// One report per distinct fault per window. The window is long enough that a sustained
// outage sends a trickle rather than a stream, short enough that a fault recurring an
// hour later is reported again instead of being silently swallowed forever.
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

// A ceiling across all faults, in case a deploy breaks many different routes at once.
const MAX_PER_MINUTE = 30;

const lastSent = new Map(); // fingerprint -> timestamp
let windowStart = Date.now();
let sentThisWindow = 0;
let suppressed = 0;

/** Identifies "the same fault again" — same route, same failure, same status. */
function fingerprint(err, context) {
  return [context.method, context.path, context.status, err?.name, err?.message]
    .join('|')
    .slice(0, 500);
}

function withinBudget(key) {
  const now = Date.now();

  if (now - windowStart >= 60_000) {
    windowStart = now;
    sentThisWindow = 0;
    // Old fingerprints would otherwise accumulate for the lifetime of the process.
    for (const [k, at] of lastSent) {
      if (now - at > DEDUPE_WINDOW_MS) lastSent.delete(k);
    }
  }

  const previous = lastSent.get(key);
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false;

  if (sentThisWindow >= MAX_PER_MINUTE) {
    suppressed += 1;
    return false;
  }

  lastSent.set(key, now);
  sentThisWindow += 1;
  return true;
}

/**
 * Forward a server fault to the configured sink. Fire-and-forget: callers must not
 * await it, and it resolves to nothing either way.
 *
 * @param {Error} err      the thrown error
 * @param {object} context { status, method, path, requestId, userId }
 */
export function reportError(err, context = {}) {
  const url = env.errorReporting.url;
  if (!url) return;

  const key = fingerprint(err, context);
  const first = !lastSent.has(key);
  if (!withinBudget(key)) return;

  // Deliberately narrow. Request bodies, cookies and headers are not included at any
  // level of detail — this payload leaves the building, and an inventory upload or a
  // session cookie must not leave with it.
  const payload = {
    service: 'kinguard-server',
    environment: env.server.nodeEnv,
    timestamp: new Date().toISOString(),
    status: context.status ?? 500,
    method: context.method ?? null,
    path: context.path ?? null,
    requestId: context.requestId ?? null,
    userId: context.userId ?? null,
    error: {
      name: err?.name ?? 'Error',
      message: err?.message ?? String(err),
      // Truncated: a full stack is enough to bloat a webhook past the receiver's limit,
      // and the frames that identify the fault are always at the top.
      stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 12).join('\n') : null,
    },
    // Tells the receiving end whether this is news or a repeat that beat the dedupe
    // window, and how many reports were dropped to stay under the ceiling.
    firstOccurrence: first,
    suppressedSinceLastReport: suppressed,
  };
  suppressed = 0;

  const headers = { 'Content-Type': 'application/json' };
  if (env.errorReporting.token) {
    headers.Authorization = `Bearer ${env.errorReporting.token}`;
  }

  // No await. AbortSignal.timeout bounds the socket so a sink that stops answering
  // cannot accumulate open connections for the life of the process.
  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn('Error reporter rejected the report', { reporterStatus: res.status });
      }
    })
    .catch((reportErr) => {
      // Logged at warn, not error: the sink being down is an operations problem, not an
      // application fault, and routing it to error would make it report itself.
      logger.warn('Error reporter unreachable', { reporterError: reportErr?.message });
    });
}

/** Test seam — clears the dedupe and rate-limit state between cases. */
export function _resetReporterState() {
  lastSent.clear();
  windowStart = Date.now();
  sentThisWindow = 0;
  suppressed = 0;
}
