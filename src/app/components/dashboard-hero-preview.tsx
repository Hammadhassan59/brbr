'use client';

import { KPICards } from '@/app/dashboard/components/kpi-cards';
import { RevenueChart } from '@/app/dashboard/components/revenue-chart';
import { PaymentBreakdown } from '@/app/dashboard/components/payment-breakdown';
import { StaffPerformanceTable } from '@/app/dashboard/components/staff-performance-table';
import { AppointmentsFeed } from '@/app/dashboard/components/appointments-feed';
import { AlertsPanel, buildAlerts } from '@/app/dashboard/components/alerts-panel';
import type { DailySummary, AppointmentWithDetails } from '@/types/database';

// ── Mock data ──

const SUMMARY: DailySummary = {
  total_revenue: 34500,
  total_bills: 12,
  cash_amount: 16600,
  jazzcash_amount: 6900,
  easypaisa_amount: 1200,
  card_amount: 4800,
  bank_transfer_amount: 0,
  udhaar_amount: 5000,
  top_services: [
    { name: 'Keratin Treatment', count: 2, revenue: 12000 },
    { name: 'Hair Color', count: 3, revenue: 9000 },
    { name: 'Bridal Trial', count: 1, revenue: 8000 },
    { name: 'Highlights', count: 2, revenue: 5000 },
    { name: 'Haircut + Blowdry', count: 8, revenue: 4000 },
  ],
  staff_performance: [
    { name: 'Sara', services_done: 6, revenue: 14200 },
    { name: 'Nina', services_done: 4, revenue: 11000 },
    { name: 'Reem', services_done: 3, revenue: 5800 },
    { name: 'Aisha', services_done: 2, revenue: 3500 },
  ],
};

const CHART_DATA = [
  { label: '9AM', revenue: 1200, appointments: 1 },
  { label: '10AM', revenue: 4200, appointments: 2 },
  { label: '11AM', revenue: 14300, appointments: 2 },
  { label: '12PM', revenue: 5000, appointments: 1 },
  { label: '1PM', revenue: 500, appointments: 1 },
  { label: '2PM', revenue: 8000, appointments: 1 },
  { label: '3PM', revenue: 1300, appointments: 1 },
  { label: '4PM', revenue: 0, appointments: 0 },
  { label: '5PM', revenue: 0, appointments: 0 },
  { label: '6PM', revenue: 0, appointments: 0 },
  { label: '7PM', revenue: 0, appointments: 0 },
  { label: '8PM', revenue: 0, appointments: 0 },
  { label: '9PM', revenue: 0, appointments: 0 },
];

const STAFF_PERF = SUMMARY.staff_performance.map((sp) => ({
  ...sp,
  commission: sp.revenue * 0.25,
}));

const ALERTS = buildAlerts({
  lowStockCount: 3,
  udhaarClients: 4,
  udhaarTotal: 8500,
  noShowCount: 2,
});

function makeClient(name: string) {
  return {
    id: name, salon_id: 'd', name, phone: null, whatsapp: null, gender: null,
    is_vip: false, is_blacklisted: false, notes: null, hair_notes: null,
    allergy_notes: null, loyalty_points: 0, total_visits: 5, total_spent: 10000,
    udhaar_balance: 0, udhaar_limit: 5000, created_at: '',
  } as const;
}

function makeStaff(name: string) {
  return {
    id: name, salon_id: 'd', primary_branch_id: 'd', name, phone: null,
    email: null, auth_user_id: null,
    role: 'senior_stylist' as const, photo_url: null, pin_code: '0000',
    base_salary: 15000, commission_type: 'percentage' as const,
    commission_rate: 25, join_date: '', is_active: true,
    last_login_at: null, first_login_seen: false, created_at: '',
  };
}

const APPOINTMENTS: AppointmentWithDetails[] = [
  { id: '1', status: 'done', start_time: '10:00:00', client: makeClient('Anna M.'), staff: makeStaff('Sara'), services: [{ id: 's1', appointment_id: '1', service_id: null, service_name: 'Haircut + Blowdry', price: 1200, duration_minutes: 45 }], is_walkin: false },
  { id: '2', status: 'done', start_time: '10:30:00', client: makeClient('Lena K.'), staff: makeStaff('Nina'), services: [{ id: 's2', appointment_id: '2', service_id: null, service_name: 'Full Hair Color', price: 3000, duration_minutes: 90 }], is_walkin: false },
  { id: '3', status: 'in_progress', start_time: '11:00:00', client: makeClient('Mia R.'), staff: makeStaff('Sara'), services: [{ id: 's3', appointment_id: '3', service_id: null, service_name: 'Keratin Treatment', price: 12000, duration_minutes: 120 }], is_walkin: false },
  { id: '4', status: 'in_progress', start_time: '11:30:00', client: makeClient('Sophie T.'), staff: makeStaff('Reem'), services: [{ id: 's4', appointment_id: '4', service_id: null, service_name: 'Facial + Wax', price: 2300, duration_minutes: 60 }], is_walkin: false },
  { id: '5', status: 'confirmed', start_time: '12:00:00', client: makeClient('Diana L.'), staff: makeStaff('Nina'), services: [{ id: 's5', appointment_id: '5', service_id: null, service_name: 'Highlights', price: 5000, duration_minutes: 90 }], is_walkin: false },
  { id: '6', status: 'booked', start_time: '12:30:00', staff: makeStaff('Reem'), services: [{ id: 's6', appointment_id: '6', service_id: null, service_name: 'Haircut', price: 500, duration_minutes: 30 }], is_walkin: true, token_number: 4 },
  { id: '7', status: 'booked', start_time: '13:30:00', client: makeClient('Nora B.'), staff: makeStaff('Sara'), services: [{ id: 's7', appointment_id: '7', service_id: null, service_name: 'Bridal Trial', price: 8000, duration_minutes: 120 }], is_walkin: false },
  { id: '8', status: 'booked', start_time: '14:00:00', client: makeClient('Emma S.'), staff: makeStaff('Nina'), services: [{ id: 's8', appointment_id: '8', service_id: null, service_name: 'Balayage', price: 8000, duration_minutes: 90 }], is_walkin: false },
].map((a) => ({
  branch_id: 'demo', salon_id: 'demo', client_id: a.client?.id ?? null,
  staff_id: a.staff.id, appointment_date: '2026-04-10', end_time: null,
  token_number: null, notes: null, reminder_sent: false, created_at: '2026-04-10T00:00:00Z',
  ...a,
})) as AppointmentWithDetails[];

// ── Component ──

export function DashboardHeroPreview() {
  return (
    <div className="space-y-6 p-5">
      <KPICards
        summary={SUMMARY}
        appointmentsDone={5}
        appointmentsTotal={12}
        walkIns={3}
        cashInDrawer={18200}
        loading={false}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <RevenueChart data={CHART_DATA} loading={false} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PaymentBreakdown summary={SUMMARY} loading={false} />
            <AlertsPanel alerts={ALERTS} loading={false} />
          </div>

          <StaffPerformanceTable data={STAFF_PERF} loading={false} />
        </div>

        <div>
          <AppointmentsFeed appointments={APPOINTMENTS} loading={false} />
        </div>
      </div>
    </div>
  );
}
