import { describe, it, expect } from 'vitest';
import { sanitizeCell } from './excelExport.js';

describe('sanitizeCell', () => {
  it('passes through plain strings unchanged', () => {
    expect(sanitizeCell('Normal text')).toBe('Normal text');
  });

  it('passes through numbers unchanged', () => {
    expect(sanitizeCell(42)).toBe(42);
  });

  it('passes through null unchanged', () => {
    expect(sanitizeCell(null)).toBe(null);
  });

  it('prefixes strings starting with = to prevent formula injection', () => {
    expect(sanitizeCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });

  it('prefixes strings starting with + ', () => {
    expect(sanitizeCell('+1')).toBe("'+1");
  });

  it('prefixes strings starting with -', () => {
    expect(sanitizeCell('-1')).toBe("'-1");
  });

  it('prefixes strings starting with @', () => {
    expect(sanitizeCell('@IMPORTRANGE("url","A1")')).toBe("'@IMPORTRANGE(\"url\",\"A1\")");
  });

  it('does not prefix empty strings', () => {
    expect(sanitizeCell('')).toBe('');
  });
});
