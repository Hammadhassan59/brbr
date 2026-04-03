import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { phone, pin } = await req.json();

    if (!phone || !pin) {
      return NextResponse.json({ error: 'Phone and PIN required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check staff first
    const { data: staffData } = await supabase
      .from('staff')
      .select('*')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();

    if (staffData) {
      if (staffData.pin_code !== pin) {
        return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
      }

      const { data: salon } = await supabase
        .from('salons')
        .select('*')
        .eq('id', staffData.salon_id)
        .single();

      const { data: branches } = await supabase
        .from('branches')
        .select('*')
        .eq('salon_id', staffData.salon_id)
        .order('is_main', { ascending: false });

      return NextResponse.json({
        type: 'staff',
        staff: staffData,
        salon,
        branches: branches || [],
      });
    }

    // Check partners
    const { data: partnerData } = await supabase
      .from('salon_partners')
      .select('*')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();

    if (partnerData) {
      if (partnerData.pin_code !== pin) {
        return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
      }

      const { data: salon } = await supabase
        .from('salons')
        .select('*')
        .eq('id', partnerData.salon_id)
        .single();

      const { data: branches } = await supabase
        .from('branches')
        .select('*')
        .eq('salon_id', partnerData.salon_id)
        .order('is_main', { ascending: false });

      return NextResponse.json({
        type: 'partner',
        partner: partnerData,
        salon,
        branches: branches || [],
      });
    }

    return NextResponse.json({ error: 'Phone number not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
