/**
 * Trigger a browser file download from a Blob.
 *
 * iOS Safari does not support programmatic clicks on blob: URLs — the browser
 * silently ignores them. We detect touch-only devices and fall back to
 * window.open() which opens the file in a new tab where the user can tap
 * "Share → Save to Files" or long-press to save.
 *
 * Every other browser uses the standard hidden-anchor approach.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);

  const isTouchOnly = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (isTouchOnly) {
    // Mobile: open in new tab — user can save from the browser UI
    window.open(url, '_blank', 'noopener');
    // Give the browser a moment to start reading the blob before revoking
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  // Desktop: hidden anchor click
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
