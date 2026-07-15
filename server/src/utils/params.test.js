import { describe, it, expect } from 'vitest';
import { parseId, requireId, parsePage, parsePageSize, parseIntParam } from './params.js';

describe('parseId', () => {
  it('returns undefined for absent values', () => {
    expect(parseId(undefined)).toBeUndefined();
    expect(parseId(null)).toBeUndefined();
    expect(parseId('')).toBeUndefined();
  });

  it('parses a valid positive integer string', () => {
    expect(parseId('5')).toBe(5);
    expect(parseId('100')).toBe(100);
  });

  it('parses a numeric value', () => {
    expect(parseId(42)).toBe(42);
  });

  it('throws on non-numeric string', () => {
    expect(() => parseId('abc')).toThrow();
    expect(() => parseId('5abc')).toThrow();
  });

  it('throws on zero or negative', () => {
    expect(() => parseId('0')).toThrow();
    expect(() => parseId('-1')).toThrow();
  });
});

describe('requireId', () => {
  it('throws when value is absent', () => {
    expect(() => requireId(undefined, 'userId')).toThrow();
    expect(() => requireId('', 'userId')).toThrow();
  });

  it('parses a valid id', () => {
    expect(requireId('7', 'userId')).toBe(7);
  });
});

describe('parsePage', () => {
  it('returns default when absent', () => {
    expect(parsePage(undefined, 1)).toBe(1);
    expect(parsePage('', 2)).toBe(2);
  });

  it('parses valid page numbers', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage('1')).toBe(1);
  });

  it('throws on page < 1', () => {
    expect(() => parsePage('0')).toThrow();
  });
});

describe('parsePageSize', () => {
  it('returns default when absent', () => {
    expect(parsePageSize(undefined, 50, 200)).toBe(50);
  });

  it('parses within range', () => {
    expect(parsePageSize('25', 50, 200)).toBe(25);
    expect(parsePageSize('200', 50, 200)).toBe(200);
  });

  it('throws when exceeding max', () => {
    expect(() => parsePageSize('201', 50, 200)).toThrow();
  });

  it('throws on non-numeric input', () => {
    expect(() => parsePageSize('abc', 50, 200)).toThrow();
  });
});

describe('parseIntParam', () => {
  it('returns default when absent', () => {
    expect(parseIntParam(undefined, 'cycles', 6, 1, 24)).toBe(6);
  });

  it('parses valid values within range', () => {
    expect(parseIntParam('12', 'cycles', 6, 1, 24)).toBe(12);
    expect(parseIntParam('1',  'cycles', 6, 1, 24)).toBe(1);
    expect(parseIntParam('24', 'cycles', 6, 1, 24)).toBe(24);
  });

  it('throws when below min', () => {
    expect(() => parseIntParam('0', 'cycles', 6, 1, 24)).toThrow();
  });

  it('throws when above max', () => {
    expect(() => parseIntParam('25', 'cycles', 6, 1, 24)).toThrow();
  });
});
