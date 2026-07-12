/**
 * Skeleton loading placeholder that matches the card layout used across admin pages.
 *
 * Props:
 *   rows    – number of skeleton rows (default 3)
 *   heights – array of pixel heights per row; falls back to default skeleton height
 *   padding – card padding (default '40px 20px')
 */
export function LoadingCard({ rows = 3, heights = [], padding = '40px 20px' }) {
  return (
    <div className="card" style={{ padding }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-card"
          style={{
            marginBottom: i < rows - 1 ? 12 : 0,
            height:       heights[i] ?? undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Compact text-only skeleton (e.g. for headers). */
export function LoadingText({ width = '40%', height = 24, style }) {
  return (
    <div
      className="skeleton skeleton-text"
      style={{ width, height, ...style }}
    />
  );
}

/**
 * Table-shaped skeleton — a header bar plus `rows` striped row bars with
 * varied cell widths, so loading mirrors the real table layout.
 *
 * Props:
 *   rows – number of body rows (default 6)
 *   cols – number of cells per row (default 5)
 */
export function SkeletonTable({ rows = 6, cols = 5 }) {
  // Deterministic pseudo-random widths so rows look organic but never reflow
  const widths = (row, col) => 40 + ((row * 7 + col * 13) % 45);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }} aria-busy="true" aria-label="Loading table">
      {/* header */}
      <div style={{ display: 'flex', gap: 18, padding: '14px 18px', borderBottom: '1px solid var(--border, rgba(185,28,28,0.14))' }}>
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="skeleton skeleton-text" style={{ width: `${widths(0, c)}%`, height: 12, marginBottom: 0, flex: 1 }} />
        ))}
      </div>
      {/* rows */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap: 18, padding: '15px 18px', borderBottom: r < rows - 1 ? '1px solid var(--border-subtle, rgba(185,28,28,0.08))' : 'none' }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} style={{ flex: 1 }}>
              <div className="skeleton skeleton-text" style={{ width: `${widths(r + 1, c)}%`, height: 11, marginBottom: 0 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
