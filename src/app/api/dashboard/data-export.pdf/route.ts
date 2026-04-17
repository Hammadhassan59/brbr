/**
 * GET /api/dashboard/data-export.pdf
 *
 * Owner-facing data export. Produces a multi-section PDF covering the
 * salon's profile, branches, staff, services, clients, and the last 90
 * days of bills + appointments + current inventory snapshot.
 *
 * Authenticated via the same icut-token JWT the rest of the dashboard
 * uses (verifySession). Service-role Supabase client pulls everything;
 * scoping is done by session.salonId on every query.
 *
 * Server actions can't return binary streams in Next.js 16, so this
 * lives in an API route instead. PDF bytes are streamed via pdfkit →
 * PassThrough → ReadableStream → NextResponse.
 */

import { NextResponse } from 'next/server';
import { verifySession } from '@/app/actions/auth';
import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/tenant-guard';
import { ReportPDF } from '@/lib/pdf-export';

// pdfkit needs Node.js runtime (filesystem font loading), not edge.
export const runtime = 'nodejs';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function fmtPKR(n: number | null | undefined): string {
  if (n == null) return 'Rs 0';
  return `Rs ${Math.round(Number(n)).toLocaleString('en-PK')}`;
}

export async function GET() {
  let session;
  try {
    session = await verifySession();
  } catch {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!session.salonId || session.salonId === 'super-admin') {
    return NextResponse.json({ error: 'No salon for this session' }, { status: 400 });
  }
  if (!hasPermission(session, 'export_data')) {
    return NextResponse.json({ error: 'You do not have permission to export data' }, { status: 403 });
  }

  const supabase = createServerClient();

  const [
    { data: salon },
    { data: branches },
    { data: staff },
    { data: services },
    { data: clients },
    { data: products },
  ] = await Promise.all([
    supabase.from('salons').select('*').eq('id', session.salonId).maybeSingle(),
    supabase.from('branches').select('*').eq('salon_id', session.salonId).order('is_main', { ascending: false }),
    supabase.from('staff').select('id, name, role, email, phone, branch_id, base_salary, commission_type, commission_rate, is_active').eq('salon_id', session.salonId).order('name'),
    supabase.from('services').select('id, name, category, base_price, duration_minutes, is_active').eq('salon_id', session.salonId).order('name'),
    // Cap at 5,000 rows to prevent a DoS where a salon with 100k+ clients
    // allocates unbounded memory during PDF generation. The summary counts
    // and udhaar table below still reflect this capped slice; anything
    // larger should use a paginated CSV export instead.
    supabase.from('clients').select('id, name, phone, udhaar_balance, total_visits, last_visit_at, created_at').eq('salon_id', session.salonId).order('created_at', { ascending: false }).limit(5000),
    supabase.from('products').select('id, name, brand, current_stock, low_stock_threshold, unit, purchase_price, retail_price').eq('salon_id', session.salonId).eq('is_active', true).order('name'),
  ]);

  if (!salon) {
    return NextResponse.json({ error: 'Salon not found' }, { status: 404 });
  }

  // Last 90 days of bills + appointments. Capped at 500 rows to keep PDF manageable.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: bills }, { data: appointments }] = await Promise.all([
    supabase
      .from('bills')
      .select('id, total_amount, payment_method, created_at, client:clients(name), staff:staff(name)')
      .eq('salon_id', session.salonId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('appointments')
      .select('id, appointment_date, start_time, status, is_walkin, client:clients(name), staff:staff(name)')
      .eq('salon_id', session.salonId)
      .gte('appointment_date', cutoff.slice(0, 10))
      .order('appointment_date', { ascending: false })
      .limit(500),
  ]);

  const branchById = new Map<string, { name: string }>();
  for (const b of (branches || []) as { id: string; name: string }[]) branchById.set(b.id, { name: b.name });

  // Try to fetch the owner's email for the cover page.
  let ownerEmail = '';
  if (salon.owner_id) {
    const { data: owner } = await supabase.auth.admin.getUserById(salon.owner_id);
    ownerEmail = owner?.user?.email ?? '';
  }

  const pdf = new ReportPDF();

  // ─── Cover ───
  pdf.cover({
    title: salon.name || 'iCut data export',
    subtitle: 'Data export · iCut',
    meta: [
      ['Owner', ownerEmail || '—'],
      ['City', salon.city || '—'],
      ['Plan', `${salon.subscription_plan ?? 'none'} (${salon.subscription_status ?? 'unknown'})`],
      ['Subscription expires', fmtDate(salon.subscription_expires_at)],
      ['Branches', String((branches || []).length)],
      ['Staff', String((staff || []).length)],
      ['Clients', String((clients || []).length)],
      ['Exported', new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })],
    ],
  });
  pdf.paragraph(
    'This export contains your salon profile, branches, staff, services, clients, the most recent 90 days of bills and appointments, and a current inventory snapshot. You can download it again anytime from /dashboard/billing.',
  );

  // ─── Profile ───
  pdf.section('Salon profile');
  pdf.kv([
    ['Name', salon.name ?? '—'],
    ['Type', salon.type ?? '—'],
    ['Phone', salon.phone ?? '—'],
    ['Address', salon.address ?? '—'],
    ['Owner email', ownerEmail || '—'],
    ['Setup complete', salon.setup_complete ? 'Yes' : 'No'],
    ['Subscription started', fmtDate(salon.subscription_started_at)],
    ['Subscription expires', fmtDate(salon.subscription_expires_at)],
  ]);

  // ─── Branches ───
  pdf.section(`Branches (${(branches || []).length})`);
  pdf.table(branches || [], [
    { key: 'name', label: 'Name', width: 0.3 },
    { key: 'address', label: 'Address', width: 0.4 },
    { key: 'phone', label: 'Phone', width: 0.2 },
    { key: 'is_main', label: 'Main', width: 0.1, format: (v) => (v ? '✓' : '') },
  ]);

  // ─── Staff ───
  pdf.section(`Staff (${(staff || []).length})`);
  pdf.table(staff || [], [
    { key: 'name', label: 'Name', width: 0.25 },
    { key: 'role', label: 'Role', width: 0.15 },
    { key: 'phone', label: 'Phone', width: 0.15 },
    { key: 'branch_id', label: 'Branch', width: 0.2, format: (v) => branchById.get(String(v))?.name ?? '—' },
    { key: 'base_salary', label: 'Salary', width: 0.15, align: 'right', format: (v) => fmtPKR(Number(v)) },
    { key: 'is_active', label: 'Active', width: 0.1, format: (v) => (v ? '✓' : '✗') },
  ]);

  // ─── Services ───
  pdf.section(`Services menu (${(services || []).length})`);
  pdf.table(services || [], [
    { key: 'name', label: 'Service', width: 0.4 },
    { key: 'category', label: 'Category', width: 0.2 },
    { key: 'duration_minutes', label: 'Duration', width: 0.15, align: 'right', format: (v) => `${v} min` },
    { key: 'base_price', label: 'Price', width: 0.15, align: 'right', format: (v) => fmtPKR(Number(v)) },
    { key: 'is_active', label: 'Active', width: 0.1, format: (v) => (v ? '✓' : '✗') },
  ]);

  // ─── Clients ───
  pdf.section(`Clients (${(clients || []).length})`);
  const clientsWithUdhaar = (clients || []).filter((c: { udhaar_balance: number }) => Number(c.udhaar_balance) > 0);
  if (clientsWithUdhaar.length > 0) {
    pdf.paragraph(`${clientsWithUdhaar.length} client${clientsWithUdhaar.length === 1 ? '' : 's'} with outstanding udhaar:`);
    pdf.table(clientsWithUdhaar, [
      { key: 'name', label: 'Client', width: 0.35 },
      { key: 'phone', label: 'Phone', width: 0.25 },
      { key: 'udhaar_balance', label: 'Udhaar', width: 0.2, align: 'right', format: (v) => fmtPKR(Number(v)) },
      { key: 'last_visit_at', label: 'Last visit', width: 0.2, format: (v) => fmtDate(String(v ?? '')) },
    ]);
  }
  pdf.paragraph(`Most recent 100 clients (showing newest first):`);
  pdf.table((clients || []).slice(0, 100), [
    { key: 'name', label: 'Client', width: 0.3 },
    { key: 'phone', label: 'Phone', width: 0.25 },
    { key: 'total_visits', label: 'Visits', width: 0.15, align: 'right' },
    { key: 'last_visit_at', label: 'Last visit', width: 0.15, format: (v) => fmtDate(String(v ?? '')) },
    { key: 'created_at', label: 'Joined', width: 0.15, format: (v) => fmtDate(String(v)) },
  ]);

  // ─── Bills (last 90 days) ───
  type BillRow = { id: string; total_amount: number; payment_method: string; created_at: string; client: { name: string } | null; staff: { name: string } | null };
  const billsTyped = (bills || []) as unknown as BillRow[];
  const billsTotal = billsTyped.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  pdf.section(`Bills — last 90 days (${billsTyped.length}${billsTyped.length === 500 ? '+, capped' : ''})`);
  pdf.paragraph(`Total revenue in window: ${fmtPKR(billsTotal)}`);
  pdf.table(billsTyped, [
    { key: 'created_at', label: 'Date', width: 0.18, format: (v) => fmtDate(String(v)) },
    { key: 'client', label: 'Client', width: 0.27, format: (v) => (v as { name?: string } | null)?.name ?? '—' },
    { key: 'staff', label: 'Stylist', width: 0.2, format: (v) => (v as { name?: string } | null)?.name ?? '—' },
    { key: 'payment_method', label: 'Method', width: 0.15 },
    { key: 'total_amount', label: 'Amount', width: 0.2, align: 'right', format: (v) => fmtPKR(Number(v)) },
  ]);

  // ─── Appointments (last 90 days) ───
  type AppRow = { id: string; appointment_date: string; start_time: string; status: string; is_walkin: boolean; client: { name: string } | null; staff: { name: string } | null };
  const apptsTyped = (appointments || []) as unknown as AppRow[];
  pdf.section(`Appointments — last 90 days (${apptsTyped.length}${apptsTyped.length === 500 ? '+, capped' : ''})`);
  pdf.table(apptsTyped, [
    { key: 'appointment_date', label: 'Date', width: 0.18, format: (v) => fmtDate(String(v)) },
    { key: 'start_time', label: 'Time', width: 0.12 },
    { key: 'client', label: 'Client', width: 0.25, format: (v) => (v as { name?: string } | null)?.name ?? '—' },
    { key: 'staff', label: 'Stylist', width: 0.25, format: (v) => (v as { name?: string } | null)?.name ?? '—' },
    { key: 'status', label: 'Status', width: 0.2 },
  ]);

  // ─── Inventory snapshot ───
  pdf.section(`Inventory (${(products || []).length} active products)`);
  pdf.table(products || [], [
    { key: 'name', label: 'Product', width: 0.3 },
    { key: 'brand', label: 'Brand', width: 0.15 },
    { key: 'current_stock', label: 'Stock', width: 0.15, align: 'right' },
    { key: 'unit', label: 'Unit', width: 0.1 },
    { key: 'purchase_price', label: 'Cost', width: 0.15, align: 'right', format: (v) => fmtPKR(Number(v)) },
    { key: 'retail_price', label: 'Retail', width: 0.15, align: 'right', format: (v) => fmtPKR(Number(v)) },
  ]);

  pdf.footer(`Generated by iCut on ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} · For full historical data export, contact support.`);

  const stream = pdf.finish();
  const filename = `${(salon.name || 'icut').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-data-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
