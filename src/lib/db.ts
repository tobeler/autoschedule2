// =============================================================
// Drizzle Postgres client.
//
// Uses `postgres-js` over a single direct connection. We disable
// prepared statements (`prepare: false`) so the client works with
// Supabase's PgBouncer transaction pooler in production without
// the "prepared statement already exists" surprise.
//
// `globalThis.__pg` keeps a single connection alive across HMR /
// route handler reloads in dev, avoiding Postgres's "too many
// clients" error.
// =============================================================

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';

type GlobalWithPg = typeof globalThis & {
  __jetsonPg?: ReturnType<typeof postgres>;
};

const g = globalThis as GlobalWithPg;

function client() {
  if (!g.__jetsonPg) {
    // Fall back to a localhost placeholder during build / when env is
    // missing — postgres-js connects lazily, so no error fires until
    // we actually run a query. The runtime throw guards real usage.
    const url =
      process.env.DATABASE_URL ?? 'postgresql://placeholder@127.0.0.1:5432/jetson';
    g.__jetsonPg = postgres(url, { prepare: false });
  }
  return g.__jetsonPg;
}

export const db = drizzle(client(), { schema });
export { schema };
