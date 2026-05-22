import 'dotenv/config';
import type { Config } from 'drizzle-kit';

// Drizzle Kit config — drives `drizzle-kit generate` and `drizzle-kit push`.
// In CI / local dev, `DATABASE_URL` is read from `.env.local`. We don't
// actually need the URL to be reachable for `generate` (it diffs against the
// last snapshot in `meta/`), so a placeholder is fine until Supabase exists.
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://placeholder@localhost:5432/jetson',
  },
  strict: true,
  verbose: true,
} satisfies Config;
