/**
 * Standard page header with title, optional subtitle, and optional action slot.
 *
 * Props:
 *   title    – string (required)
 *   subtitle – string | ReactNode
 *   actions  – ReactNode (buttons / links rendered on the right)
 */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
