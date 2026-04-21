import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sweepOrphansInternal } from '@/app/actions/admin';

// Run daily via systemd timer on the Hetzner box.
// Call: curl -H "X-Cron-Secret: <secret>" https://icut.pk/api/cron/sweep-orphan-users
//
// Deletes auth.users rows that have no references in salons/staff/partners/
// admin_users/sales_agents/agency_admins. Accounts younger than 15 minutes
// are skipped so mid-signup users aren't killed.

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

  const { data, error } = await sweepOrphansInternal();
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}
