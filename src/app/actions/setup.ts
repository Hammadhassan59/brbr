'use server';

import { createServerClient } from '@/lib/supabase';

// Setup does NOT call verifySession — there is no session yet during first-time setup.
// The owner is authenticated via Supabase Auth (owner_id comes from getUser()).

export async function setupSalon(data: {
  existingSalonId?: string;
  name: string;
  slug: string;
  type: string;
  city: string;
  address: string;
  phone: string;
  whatsapp: string;
  ownerId: string;
  prayerBlockEnabled: boolean;
  workingHours: Record<string, unknown>;
  services: Array<{ name: string; category: string; price: number; duration: number }>;
  partners: Array<{ name: string; phone: string; pin: string }>;
  staff: Array<{ name: string; phone: string; role: string; pin: string }>;
}) {
  const supabase = createServerClient();

  // Create salon
  const { data: newSalon, error: salonErr } = await supabase
    .from('salons')
    .upsert({
      ...(data.existingSalonId ? { id: data.existingSalonId } : {}),
      name: data.name,
      slug: data.slug,
      type: data.type,
      city: data.city,
      address: data.address,
      phone: data.phone,
      whatsapp: data.whatsapp,
      owner_id: data.ownerId,
      setup_complete: true,
      prayer_block_enabled: data.prayerBlockEnabled,
    })
    .select()
    .single();

  if (salonErr) return { data: null, error: salonErr.message };

  // Create main branch
  const { data: branch, error: branchErr } = await supabase
    .from('branches')
    .insert({
      salon_id: newSalon.id,
      name: `${data.city || 'Main'} Branch`,
      address: data.address,
      phone: data.phone,
      is_main: true,
      working_hours: data.workingHours,
    })
    .select()
    .single();

  if (branchErr) return { data: null, error: branchErr.message };

  // Create services
  if (data.services.length > 0) {
    const { error: svcErr } = await supabase.from('services').insert(
      data.services.map((s, i) => ({
        salon_id: newSalon.id,
        name: s.name,
        category: s.category,
        base_price: s.price,
        duration_minutes: s.duration,
        sort_order: i,
      }))
    );
    if (svcErr) return { data: null, error: svcErr.message };
  }

  // Create partners
  if (data.partners.length > 0) {
    const { error: partnerErr } = await supabase.from('salon_partners').insert(
      data.partners.map(p => ({
        salon_id: newSalon.id,
        name: p.name,
        phone: p.phone,
        pin_code: p.pin,
      }))
    );
    if (partnerErr) return { data: null, error: partnerErr.message };
  }

  // Create staff
  if (data.staff.length > 0) {
    const { error: staffErr } = await supabase.from('staff').insert(
      data.staff.map(s => ({
        salon_id: newSalon.id,
        branch_id: branch.id,
        name: s.name,
        phone: s.phone,
        role: s.role,
        pin_code: s.pin,
      }))
    );
    if (staffErr) return { data: null, error: staffErr.message };
  }

  return { data: { salon: newSalon, branch }, error: null };
}
