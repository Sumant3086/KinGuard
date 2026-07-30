import { describe, it, expect } from 'vitest';
import { computeDifference } from './inventoryMath.js';

describe('computeDifference', () => {
  it('subtracts the system figure from the physical count', () => {
    expect(computeDifference(8, 10)).toBe(-2);
    expect(computeDifference(12, 10)).toBe(2);
    expect(computeDifference(10, 10)).toBe(0);
  });

  it.each([
    ['no physical count yet', null, 10],
    ['no system quantity yet', 8, null],
    ['neither side known', null, null],
    ['an undefined physical count', undefined, 10],
    ['an undefined system quantity', 8, undefined],
  ])('returns null with %s', (_label, phys, sys) => {
    // Zero would read as a perfect match on an item nobody has counted, and the
    // submit gate treats difference === 0 as "no discrepancy to explain".
    expect(computeDifference(phys, sys)).toBeNull();
  });

  it('treats a genuine zero on either side as a real figure', () => {
    expect(computeDifference(0, 10)).toBe(-10);
    expect(computeDifference(10, 0)).toBe(10);
    expect(computeDifference(0, 0)).toBe(0);
  });

  it('rounds away float noise that would otherwise look like a discrepancy', () => {
    // 10.2 - 10.1 is 0.09999999999999964 in IEEE 754.
    expect(computeDifference(10.2, 10.1)).toBe(0.1);
  });
});
