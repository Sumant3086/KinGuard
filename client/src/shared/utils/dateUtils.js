const LOCALE = 'en-GB';

const OPTS = {
  short:    { day: 'numeric', month: 'short', year: 'numeric' },
  long:     { day: 'numeric', month: 'long',  year: 'numeric' },
  monthDay: { day: 'numeric', month: 'short' },
  time:     { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  timeLong: { day: 'numeric', month: 'long',  hour: '2-digit', minute: '2-digit' },
  dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' },
};

function toDate(value) {
  if (value == null) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a date value to a locale date string. style: 'short' | 'long' | 'monthDay' | 'time' | 'timeLong' | 'dateTime' */
export function fmtDate(value, style = 'short') {
  const d = toDate(value);
  if (!d) return '—';
  // Always display in Congo timezone (CAT, UTC+2) for consistency
  return d.toLocaleDateString(LOCALE, { ...OPTS[style] ?? OPTS.short, timeZone: 'Africa/Kinshasa' });
}

/** Format as a datetime string (includes seconds). */
export function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  // Always display in Congo timezone (CAT, UTC+2) for consistency
  return d.toLocaleString(LOCALE, { ...OPTS.dateTime, timeZone: 'Africa/Kinshasa' });
}

/** Return the ISO date portion only: "2026-07-11". */
export function fmtISO(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toISOString().split('T')[0];
}

/** Format a date string in a specific timezone (e.g. Africa/Kinshasa). */
export function fmtDateTZ(dateStr, timeZone, style = 'long') {
  const d = toDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString(LOCALE, { ...OPTS[style], timeZone });
}

/** Check if a deadline has passed in Congo timezone (Africa/Kinshasa, CAT, UTC+2) */
export function isDeadlinePassed(deadlineStr) {
  if (!deadlineStr) return false;
  const deadline = toDate(deadlineStr);
  if (!deadline) return false;
  
  // Get current time in Congo timezone (CAT, UTC+2)
  const nowInCongo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Kinshasa' }));
  return nowInCongo > deadline;
}
