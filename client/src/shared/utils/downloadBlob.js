/**
 * Trigger a browser file download from a Blob.
 * Appends a temporary <a> to the document before clicking — required by
 * Firefox, which ignores clicks on detached elements.
 * Revokes the object URL after a short delay so the browser has time to
 * start reading the blob before we release it.
 *
 * @param {Blob} blob     - The blob to download.
 * @param {string} filename - The suggested filename.
 */
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Defer cleanup so the browser can start reading the object URL before revoke
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}
