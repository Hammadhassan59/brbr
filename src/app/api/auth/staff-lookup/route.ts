import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp, isBodyTooLarge } from '@/lib/rate-limit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PHONE_MAX_LEN = 20;
const MAX_BODY_BYTES = 1024; // auth lookup payloads are tiny by design

function isValidPhone(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= PHONE_MAX_LEN;
}

export async function POST(req: NextRequest) {
  if (isBodyTooLarge(req, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const ip = getClientIp(req);
  const rl = rateLimit(`lookup:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone = (body as { phone?: unknown })?.phone;
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: 'Phone required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: staffData, error: staffErr } = await supabase
    .from('staff')
    .select('id, name, role')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();

  if (staffErr) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  if (staffData) {
    return NextResponse.json({
      type: 'staff',
      person: { id: staffData.id, name: staffData.name, role: staffData.role },
    });
  }

  const { data: partnerData, error: partnerErr } = await supabase
    .from('salon_partners')
    .select('id, name')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();

  if (partnerErr) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  if (partnerData) {
    return NextResponse.json({
      type: 'partner',
      person: { id: partnerData.id, name: partnerData.name, role: 'owner' },
    });
  }

  return NextResponse.json({ error: 'Phone number not found' }, { status: 404 });
}
