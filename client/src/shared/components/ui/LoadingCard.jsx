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
