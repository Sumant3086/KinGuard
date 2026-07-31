import { defineConfig } from 'vitest/config';

// Default run: unit tests only. Integration tests are named *.int.test.js and need a
// real PostgreSQL instance, so they are excluded here and run from
// vitest.integration.config.js instead (npm run test:integration).
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.test.js'],
  },
});
