import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sweepNoShowsInternal } from '@/app/actions/appointments';

// Run nightly at 02:00 PKT via systemd timer on the Hetzner box.
// Call: curl -H "X-Cron-Secret: <secret>" https://icut.pk/api/cron/sweep-no-shows
//
// Flips stale booked/confirmed appointments to no_show once their
// end_time + 30min grace has passed. Preserves history (doesn't delete),
// distinguishes from `cancelled` (client actively cancelled), and frees
// the calendar for the next day's view.

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const supplied = req.headers.get('x-cron-secret') ?? '';
  if (!secretsEqual(supplied, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { flipped, error } = await sweepNoShowsInternal();
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, flipped });
}
