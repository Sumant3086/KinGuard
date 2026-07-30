// Rendering rules for the two inventory quantities.
//
// Both can legitimately be blank: physicalQuantity is blank until the store counts, and
// systemQuantity is blank when the admin's upload deliberately left that column for the
// store to fill in. Blank and zero mean different things — blank is "no figure yet",
// zero is "the figure is none" — so a blank must never be rendered as 0. Falling back
// with `?? 0` shows the store a confident number nobody entered.

/** Em dash: the house style for "no value" throughout the tables. */
export const NO_VALUE = '—';

/** Display a quantity, or the blank marker when no figure has been supplied. */
export function fmtQty(value) {
  return value === null || value === undefined ? NO_VALUE : String(value);
}

/**
 * Difference between a physical count and the system figure, or null when either side
 * is still blank. Mirrors computeDifference on the server (utils/inventoryMath.js);
 * the two must agree or the UI will preview a discrepancy the server does not record.
 */
export function calcDifference(physicalQuantity, systemQuantity) {
  if (physicalQuantity === null || physicalQuantity === undefined) return null;
  if (systemQuantity === null || systemQuantity === undefined) return null;
  return parseFloat((physicalQuantity - systemQuantity).toFixed(4));
}
