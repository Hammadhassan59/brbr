import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp, isBodyTooLarge } from '@/lib/rate-limit';
import { hashPin, isHashedPin, verifyPin } from '@/lib/pin-hash';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PHONE_MAX_LEN = 20;
const PIN_LEN = 4;
const MAX_BODY_BYTES = 1024;

function isValidPhone(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= PHONE_MAX_LEN;
}

function isValidPin(v: unknown): v is string {
  return typeof v === 'string' && v.length === PIN_LEN && /^\d{4}$/.test(v);
}

type SafeStaff = {
  id: string;
  name: string;
  role: string;
  phone: string;
  salon_id: string;
  branch_id: string | null;
  first_login_seen: boolean;
};

type SafePartner = {
  id: string;
  name: string;
  phone: string;
  salon_id: string;
};

function stripStaff(row: Record<string, unknown>): SafeStaff {
  return {
    id: String(row.id),
    name: String(row.name),
    role: String(row.role),
    phone: String(row.phone),
    salon_id: String(row.salon_id),
    branch_id: row.branch_id ? String(row.branch_id) : null,
    first_login_seen: Boolean(row.first_login_seen),
  };
}

function stripPartner(row: Record<string, unknown>): SafePartner {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone),
    salon_id: String(row.salon_id),
  };
}

export async function POST(req: NextRequest) {
  if (isBodyTooLarge(req, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const ip = getClientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone = (body as { phone?: unknown })?.phone;
  const pin = (body as { pin?: unknown })?.pin;

  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: 'Phone required' }, { status: 400 });
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 });
  }

  // Rate limit per (ip, phone) — 5 attempts per 15 minutes.
  const rlKey = `login:${ip}:${phone}`;
  const rl = rateLimit(rlKey, 5, 15 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: staffRow, error: staffErr } = await supabase
    .from('staff')
    .select('*')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();

  if (staffErr) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }

  if (staffRow) {
    const storedPin = String(staffRow.pin_code ?? '');
    if (!verifyPin(pin, storedPin)) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }

    // Lazy migration: if the stored PIN is still plaintext, rehash it.
    if (!isHashedPin(storedPin)) {
      const newHash = hashPin(pin);
      await supabase.from('staff').update({ pin_code: newHash }).eq('id', staffRow.id);
    }

    // Track login time for onboarding checklist
    await supabase.from('staff').update({ last_login_at: new Date().toISOString() }).eq('id', staffRow.id);

    const { data: salon } = await supabase
      .from('salons')
      .select('*')
      .eq('id', staffRow.salon_id)
      .maybeSingle();

    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', staffRow.salon_id)
      .order('is_main', { ascending: false });

    return NextResponse.json({
      type: 'staff',
      staff: stripStaff(staffRow),
      salon,
      branches: branches || [],
    });
  }

  const { data: partnerRow, error: partnerErr } = await supabase
    .from('salon_partners')
    .select('*')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();

  if (partnerErr) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }

  if (partnerRow) {
    const storedPin = String(partnerRow.pin_code ?? '');
    if (!verifyPin(pin, storedPin)) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }

    if (!isHashedPin(storedPin)) {
      const newHash = hashPin(pin);
      await supabase.from('salon_partners').update({ pin_code: newHash }).eq('id', partnerRow.id);
    }

    const { data: salon } = await supabase
      .from('salons')
      .select('*')
      .eq('id', partnerRow.salon_id)
      .maybeSingle();

    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', partnerRow.salon_id)
      .order('is_main', { ascending: false });

    return NextResponse.json({
      type: 'partner',
      partner: stripPartner(partnerRow),
      salon,
      branches: branches || [],
    });
  }

  return NextResponse.json({ error: 'Phone number not found' }, { status: 404 });
}
