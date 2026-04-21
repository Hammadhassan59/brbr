'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import { sendEmail } from '@/lib/email-sender';
import { createAgency, provisionAgencyAdmin } from './agencies';
import type { AgencyRequest, AgencyRequestStatus, Agency } from '@/types/sales';

// ───────────────────────────────────────
// Public signup (unauthenticated)
// ───────────────────────────────────────

export interface SubmitAgencyRequestInput {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  nicNumber: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
}

/**
 * Public entry point — called from /agency-signup form, no session required.
 * Rate-limiting by IP should be added at the route level if this becomes a
 * spam target; for now relies on the reCAPTCHA-less honesty of a typed form.
 */
export async function submitAgencyRequest(
  input: SubmitAgencyRequestInput,
): Promise<{ success: boolean; error: string | null }> {
  if (!input.name?.trim() || input.name.trim().length < 2) return { success: false, error: 'Agency name is required' };
  if (!input.contactName?.trim()) return { success: false, error: 'Contact name is required' };
  if (!input.phone?.trim()) return { success: false, error: 'Phone is required' };
  if (!input.email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    return { success: false, error: 'A valid email is required' };
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('agency_requests').insert({
    name: input.name.trim(),
    contact_name: input.contactName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    nic_number: input.nicNumber?.trim() || null,
    city: input.city?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { success: false, error: error.message };

  // Best-effort super_admin notification. Not fatal — the row is safely
  // persisted regardless of whether the email reaches inbox.
  try {
    const superadminEmail = process.env.SUPERADMIN_NOTIFY_EMAIL || 'inparlorpk@gmail.com';
    await sendEmail(
      superadminEmail,
      `New agency signup request: ${input.name}`,
      `<p>A new agency signup request just came in on icut.pk:</p>
       <ul>
         <li><b>Agency:</b> ${input.name}</li>
         <li><b>Contact:</b> ${input.contactName}</li>
         <li><b>Phone:</b> ${input.phone}</li>
         <li><b>Email:</b> ${input.email}</li>
         <li><b>City:</b> ${input.city ?? '—'}</li>
         <li><b>NIC:</b> ${input.nicNumber ?? '—'}</li>
         <li><b>Address:</b> ${input.address ?? '—'}</li>
         <li><b>Notes:</b> ${input.notes ?? '—'}</li>
       </ul>
       <p>Review + approve at <a href="https://icut.pk/admin/agencies/requests">/admin/agencies/requests</a>.</p>`,
    );
  } catch {
    // swallow
  }

  return { success: true, error: null };
}

// ───────────────────────────────────────
// Super_admin review
// ───────────────────────────────────────

export async function listAgencyRequests(
  status?: AgencyRequestStatus | 'all',
): Promise<{ data: AgencyRequest[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  let q = supabase.from('agency_requests').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyRequest[], error: null };
}

/**
 * Approves a pending request: spawns an agencies row via existing createAgency
 * flow, creates the agency_admin auth account, sends the welcome email, and
 * stamps the request as 'approved' with the new agency_id.
 *
 * Defaults: firstSalePct=15, renewalPct=7, depositAmount=0 (super_admin
 * typically wants to tune these afterwards on /admin/agencies/[id]).
 */
export async function approveAgencyRequest(
  requestId: string,
  input: {
    firstSalePct?: number;
    renewalPct?: number;
    depositAmount?: number;
    liabilityThreshold?: number;
    terms?: string | null;
    reviewNotes?: string | null;
  } = {},
): Promise<{ data: Agency | null; error: string | null; adminEmailSent: boolean }> {
  const session = await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const { data: request, error: reqErr } = await supabase
    .from('agency_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (reqErr || !request) return { data: null, error: reqErr?.message || 'Request not found', adminEmailSent: false };
  if (request.status !== 'pending') return { data: null, error: `Already ${request.status}`, adminEmailSent: false };

  const r = request as AgencyRequest;
  const { data: agency, error: createErr, adminEmailSent } = await createAgency({
    name: r.name,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    city: r.city,
    nicNumber: r.nic_number,
    address: r.address,
    area: null,                           // super_admin sets area on the detail page post-approval
    firstSalePct: input.firstSalePct ?? 15,
    renewalPct: input.renewalPct ?? 7,
    depositAmount: input.depositAmount ?? 0,
    liabilityThreshold: input.liabilityThreshold ?? 0,
    terms: input.terms ?? null,
    adminEmail: r.email,
    adminName: r.contact_name,
  });
  if (createErr || !agency) return { data: null, error: createErr || 'Failed to create agency', adminEmailSent: false };

  await supabase.from('agency_requests').update({
    status: 'approved',
    reviewed_by: session.staffId,
    reviewed_at: new Date().toISOString(),
    review_notes: input.reviewNotes ?? null,
    created_agency_id: agency.id,
  }).eq('id', requestId);

  return { data: agency, error: null, adminEmailSent };
}

export async function rejectAgencyRequest(
  requestId: string,
  reviewNotes: string,
): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  if (!reviewNotes?.trim()) return { error: 'Reason required for audit trail' };
  const supabase = createServerClient();
  const { error } = await supabase.from('agency_requests').update({
    status: 'rejected',
    reviewed_by: session.staffId,
    reviewed_at: new Date().toISOString(),
    review_notes: reviewNotes.trim(),
  }).eq('id', requestId);
  return { error: error?.message ?? null };
}

/**
 * Re-sends the welcome email for an already-approved request (if the agency
 * owner never received or lost the original link).
 */
export async function resendAgencyWelcome(
  requestId: string,
): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data: request } = await supabase
    .from('agency_requests')
    .select('*, agency:agencies(id)')
    .eq('id', requestId)
    .maybeSingle();
  if (!request || request.status !== 'approved' || !request.created_agency_id) {
    return { error: 'Request not approved or agency missing' };
  }
  const r = request as AgencyRequest;
  await provisionAgencyAdmin(r.created_agency_id!, {
    email: r.email,
    name: r.contact_name,
    phone: r.phone,
  });
  return { error: null };
}
