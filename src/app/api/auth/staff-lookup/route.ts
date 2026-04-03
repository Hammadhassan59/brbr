import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check staff first
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, name, role, phone, salon_id')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();

    if (staffData) {
      return NextResponse.json({
        type: 'staff',
        person: { id: staffData.id, name: staffData.name, role: staffData.role },
      });
    }

    // Check partners
    const { data: partnerData } = await supabase
      .from('salon_partners')
      .select('id, name, phone, salon_id')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();

    if (partnerData) {
      return NextResponse.json({
        type: 'partner',
        person: { id: partnerData.id, name: partnerData.name, role: 'owner' },
      });
    }

    return NextResponse.json({ error: 'Phone number not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
