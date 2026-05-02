import 'server-only';
// Backwards-compat shim: nothing in iCut talks to Supabase anymore.
// `createServerClient` is kept so the dozens of server-action call sites
// that do `const supabase = createServerClient()` keep working — it now
// returns the pg-adapter from @/lib/pg-adapter, which mirrors the
// PostgREST chainable surface but executes against local Postgres.
//
// The browser-side `supabase` export is gone. If any client component
// re-introduces `import { supabase } from '@/lib/supabase'` the build
// fails — that's intentional. New client-side reads must be a server action.

import { pgClient } from './pg-adapter';

export function createServerClient() {
  return pgClient();
}
