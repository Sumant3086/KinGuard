// Refuses to run the integration suite against anything that might be real.
//
// Every test file here starts by truncating every table. Pointed at the Supabase
// instance the app actually uses, that is not a failing test — it is data loss with no
// undo. The suite therefore only runs against a database on this machine, unless
// someone deliberately sets ALLOW_DESTRUCTIVE_INTEGRATION_TESTS=yes.

import dotenv from 'dotenv';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'postgres', 'db']);

export default function guard() {
  // Prisma Client reads server/.env by itself, so checking process.env alone would miss
  // a Supabase URL sitting in that file and wave the run through.
  dotenv.config();
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'Integration tests need DATABASE_URL to point at a throwaway PostgreSQL database.\n' +
      'Example: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kinguard_test'
    );
  }

  if (process.env.ALLOW_DESTRUCTIVE_INTEGRATION_TESTS === 'yes') return;

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL, so it cannot be checked for safety.');
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run the integration suite against "${host}".\n` +
      'These tests TRUNCATE every table. Point DATABASE_URL at a local throwaway database,\n' +
      'or set ALLOW_DESTRUCTIVE_INTEGRATION_TESTS=yes if you are certain this one is disposable.'
    );
  }
}
