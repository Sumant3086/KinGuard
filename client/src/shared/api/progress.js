// ── Global loading-progress bus ────────────────────────────────────────────
// Tiny framework-free pub/sub. The axios client calls progressStart()/
// progressDone() around every request; <TopProgress /> subscribes and renders
// the fixed bar at the top of the viewport. A counter (not a boolean) keeps
// overlapping requests balanced.

let active = 0;
const listeners = new Set();

function emit() {
  const isActive = active > 0;
  listeners.forEach(fn => fn(isActive));
}

export function progressStart() {
  active++;
  if (active === 1) emit();
}

export function progressDone() {
  active = Math.max(0, active - 1);
  if (active === 0) emit();
}

/** Subscribe to activity changes. Returns an unsubscribe function. */
export function subscribeProgress(fn) {
  listeners.add(fn);
  fn(active > 0); // sync current state immediately
  return () => listeners.delete(fn);
}
