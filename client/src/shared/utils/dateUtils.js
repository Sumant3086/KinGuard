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
  return d.toLocaleDateString(LOCALE, OPTS[style] ?? OPTS.short);
}

/** Format as a datetime string (includes seconds). */
export function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString(LOCALE, OPTS.dateTime);
}

/** Return the ISO date portion only: "2026-07-11". */
export function fmtISO(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toISOString().split('T')[0];
}

/** Return "YYYY-MM-DD HH:MM:SS" in local time (for spreadsheets). */
export function fmtISOLocal(value) {
  const d = toDate(value);
  if (!d) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Format a date string in a specific timezone (e.g. Africa/Kinshasa). */
export function fmtDateTZ(dateStr, timeZone, style = 'long') {
  const d = toDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString(LOCALE, { ...OPTS[style], timeZone });
}
