/**
 * Standardised empty / error / no-data state.
 *
 * Props:
 *   icon        – ReactNode (SVG)
 *   title       – string
 *   description – string
 *   help        – string (smaller hint text below description)
 *   action      – ReactNode (button / link)
 *   variant     – '' | 'error' | 'success'  (adds CSS modifier to illustration wrapper)
 */
export function EmptyState({ icon, title, description, help, action, variant = '' }) {
  return (
    <div className="empty-state">
      {icon && (
        <div className={`empty-state-illustration${variant ? ` ${variant}` : ''}`}>
          {icon}
        </div>
      )}
      {title       && <h3 className="empty-state-title">{title}</h3>}
      {description && <p className="empty-state-description">{description}</p>}
      {help        && <div className="empty-state-help">{help}</div>}
      {action      && <div className="empty-state-cta">{action}</div>}
    </div>
  );
}
