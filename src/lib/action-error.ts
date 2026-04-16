/**
 * safeError — convert an unknown thrown value into a string that is safe
 * to return to the user from a server action or API route.
 *
 * Rationale: the defaults `String(err)` or `err.message` leak
 *   - stack fragments,
 *   - Supabase/Postgres error codes (sometimes revealing schema),
 *   - file paths from error origins,
 *   - third-party library diagnostics.
 *
 * In production we log the real error for operators and return a neutral
 * string to the caller. In development we surface the raw message so the
 * developer can debug without digging through logs.
 *
 * Usage:
 *
 *   import { safeError } from '@/lib/action-error';
 *
 *   try {
 *     await somethingRisky();
 *   } catch (err) {
 *     return { error: safeError(err) };
 *   }
 *
 * Actions owned by other agents can adopt this wrapper at their own pace —
 * it is additive and does not change behavior unless you swap in the call.
 */

export function safeError(err: unknown): string {
  if (process.env.NODE_ENV !== 'production') {
    if (err instanceof Error) return err.message;
    return String(err);
  }
  // Production: log for operators, return a generic message to the user.
  // eslint-disable-next-line no-console
  console.error('[action-error]', err);
  return 'Something went wrong. Please try again.';
}
