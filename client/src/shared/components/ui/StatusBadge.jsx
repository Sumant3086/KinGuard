/** Maps well-known status values to badge CSS classes. */
const STATUS_CLASS = {
  SUBMITTED:  'badge-submitted',
  PENDING:    'badge-pending',
  ACTIVE:     'badge-active',
  INACTIVE:   'badge-inactive',
  COMPLETED:  'badge-submitted',
  FAILED:     'badge-shortage',
};

/**
 * Renders a coloured badge for a known status string.
 *
 * Props:
 *   status    – one of the keys in STATUS_CLASS
 *   children  – optional label override (defaults to the status string)
 *   className – extra CSS classes
 */
export function StatusBadge({ status, children, className }) {
  const cls = STATUS_CLASS[status] ?? 'badge-inactive';
  return (
    <span className={`badge ${cls}${className ? ` ${className}` : ''}`}>
      {children ?? status}
    </span>
  );
}
