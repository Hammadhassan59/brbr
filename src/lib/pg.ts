// Direct Postgres connection pool — replaces supabase.from() for code paths
// that we're moving off PostgREST/Kong/GoTrue. Uses the standard `pg` driver
// against the icut-pg container's DATABASE_URL.
//
// Usage (server-only — never import in a client component):
//   import { pool } from '@/lib/pg';
//   const { rows } = await pool.query<MyRow>('SELECT id FROM auth.users WHERE email = $1', [email]);
//
// Connection lifecycle is managed by the pg Pool — callers don't acquire/release
// clients themselves unless they need a transaction (use pool.connect() then).

import 'server-only';
import { Pool } from 'pg';

declare global {
  // Re-use the pool across hot-reloads in dev so we don't leak connections.
   
  var __icutPgPool: Pool | undefined;
}

function buildPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL missing — set in .env.local for direct Postgres access');
  }
  return new Pool({
    connectionString: url,
    // Conservative caps for the 4GB box. Bumped if we see "too many clients".
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

// Lazy: the pool isn't built until something actually calls a method on it.
// This keeps test imports cheap (no DATABASE_URL needed unless the test
// exercises a code path that issues a real query) and lets the build pipeline
// import auth-admin.ts without DATABASE_URL set.
function getPool(): Pool {
  if (global.__icutPgPool) return global.__icutPgPool;
  const built = buildPool();
  if (process.env.NODE_ENV !== 'production') global.__icutPgPool = built;
  return built;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
