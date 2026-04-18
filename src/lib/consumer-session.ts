/**
 * Consumer session helper — reads the Supabase auth cookies written by
 * `@supabase/auth-helpers-nextjs` and returns a plain, serializable session
 * object for consumer-facing server components and server actions.
 *
 * Separate from owner session helpers (`verifySession` / `getSessionInfo` in
 * src/app/actions/auth.ts) because the two authenticate through different
 * transports:
 *   - Owners:     HttpOnly `icut-token` JWT signed with SESSION_SECRET.
 *   - Consumers:  Plain Supabase `sb-*-auth-token` cookies.
 *
 * Returns `null` when there's no Supabase session or the auth.users row isn't
 * a consumer (e.g. it's an owner or staff identity — they only belong to the
 * consumers table if they also registered as a consumer, which is unusual).
 *
 * Usage:
 *
 *   import { getConsumerSession } from '@/lib/consumer-session';
 *
 *   export default async function AccountPage() {
 *     const session = await getConsumerSession();
 *     if (!session) redirect('/login?next=/account');
 *     return <div>Welcome, {session.name}</div>;
 *   }
 */

import { createServerClient as createSupabaseSSRClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServerClient as createServiceClient } from '@/lib/supabase';

export interface ConsumerSession {
  userId: string;
  name: string;
  email: string;
  phone: string;
}

/**
 * Resolve the current consumer's session from request cookies.
 *
 * Two DB hops at most:
 *   1. `auth-helpers-nextjs` getUser — validates the cookie signature against
 *      Supabase's JWKS and gives us the `auth.users.id` + email.
 *   2. Service-role `.from('consumers').select(name, phone)` — pulls the
 *      companion row. We go through the service-role client rather than the
 *      cookie-authenticated client because `consumers` RLS policies (to be
 *      defined in migration 041) are configured around `auth.uid()`, and we
 *      want the helper to work consistently regardless of RLS tuning — the
 *      identity check already happened in step 1.
 *
 * Returns null on any failure path (no cookies, invalid token, consumer row
 * missing). Never throws — callers always get a clean null to redirect on.
 *
 * ASSUMPTION (migration 041): the `consumers` table has columns `id`, `name`,
 * `phone`. If `blocked_by_admin` becomes a hard gate we'll add the filter here.
 */
export async function getConsumerSession(): Promise<ConsumerSession | null> {
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;

    const supabase = createSupabaseSSRClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // Token refresh during a read-only action tries to rewrite cookies.
          // Outside a response context that throws — swallow and move on, the
          // next request will refresh properly.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore
          }
        },
      },
    });

    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData?.user) return null;
    const { id, email } = userData.user;
    if (!id) return null;

    const service = createServiceClient();
    const { data: consumer } = await service
      .from('consumers')
      .select('name, phone')
      .eq('id', id)
      .maybeSingle();
    if (!consumer) return null;

    return {
      userId: id,
      name: consumer.name ?? '',
      email: email ?? '',
      phone: consumer.phone ?? '',
    };
  } catch {
    return null;
  }
}
