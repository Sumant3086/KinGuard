// Difference between a store's physical count and the system's figure.
//
// Both sides are optional now. physicalQuantity is null until the store counts, and
// systemQuantity is null when the admin's upload left the column blank for the store to
// fill. A difference is only meaningful when both numbers exist — with either side
// missing the honest answer is "not known yet", not zero. Returning 0 here would report
// a perfect match for an item nobody has counted and mark it as reconciled.
//
// Rounded to 4 decimal places because these are floats and 10.2 - 10.1 is otherwise
// 0.09999999999999964, which shows up as a phantom discrepancy in the reports.
export function computeDifference(physicalQuantity, systemQuantity) {
  if (physicalQuantity === null || physicalQuantity === undefined) return null;
  if (systemQuantity === null || systemQuantity === undefined) return null;
  return parseFloat((physicalQuantity - systemQuantity).toFixed(4));
}
