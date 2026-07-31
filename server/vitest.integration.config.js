import { defineConfig } from 'vitest/config';

// Integration tests run the real controllers against a real PostgreSQL database, so
// nothing here is mocked. They exist to catch what the unit tests structurally cannot:
// raw SQL that no longer matches the schema, constraints and triggers that only the
// database enforces, and query results whose shape the mocks were only ever guessing at.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.int.test.js'],
    // Aborts the whole run before a single table is truncated if DATABASE_URL is not
    // clearly a throwaway database.
    globalSetup: ['tests/integration/guard.js'],
    // Every file truncates and re-seeds the same database, so they cannot overlap.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
