// Minimal health endpoint for container HEALTHCHECK and uptime probes.
// Intentionally:
// - no DB call (we don't want an outage in Supabase to mark the container
//   unhealthy and cascade into a restart loop)
// - no auth, no caching, no side effects
// - returns a tiny JSON body so curl/wget can verify reachability cheaply
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
