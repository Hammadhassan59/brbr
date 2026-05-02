// During the de-Supabase migration this module exposes two surfaces:
//
//   `supabase`             — the browser-side @supabase/supabase-js client.
//                             Kept for client components that still call .from
//                             until each is converted to a server action.
//                             Throws at first .from() call against a server
//                             that no longer runs PostgREST.
//
//   `createServerClient()` — returns the pg-backed adapter from @/lib/pg-adapter.
//                             Same chainable API surface (.from().select()...)
//                             so existing server-action call sites work as-is.
//
// Tests still mock @/lib/supabase wholesale and never touch this module's real
// implementation.

import { createClient } from '@supabase/supabase-js';
import { pgClient } from './pg-adapter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Browser client — only used by the still-pending client-side conversions.
// In production with Supabase removed, these calls fail at HTTP time. Each
// call site needs to be moved to a server action (Phase 2 cleanup, ongoing).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side: the pg-adapter mirrors PostgREST's chainable API but executes
// against the local Postgres pool. No Supabase service role key needed because
// pool connections authenticate as supabase_admin (superuser, bypasses RLS by
// default — which mirrors the previous behaviour of using SERVICE_ROLE_KEY).
export function createServerClient() {
  return pgClient();
}
