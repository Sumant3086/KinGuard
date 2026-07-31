// Splitting the admin controller moved every module one directory deeper. Static imports
// are checked by the linter and by module load, but a dynamic `await import()` inside a
// rarely-taken branch is not — the PDF exports shipped with a stale '../services/' path
// and failed at runtime with ERR_MODULE_NOT_FOUND. This walks the source instead, so any
// relative specifier that no longer resolves is caught before it reaches a user.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SPECIFIER = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));

describe('relative imports in the admin controllers', () => {
  it('finds the controller modules to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s resolves every relative import it declares', (file) => {
    const src = fs.readFileSync(path.join(DIR, file), 'utf8');
    const unresolved = [];
    let m;
    while ((m = SPECIFIER.exec(src)) !== null) {
      const specifier = m[1];
      if (!fs.existsSync(path.resolve(DIR, specifier))) unresolved.push(specifier);
    }
    expect(unresolved).toEqual([]);
  });
});
