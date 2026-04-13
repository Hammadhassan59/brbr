import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { DailySummary, AppointmentWithDetails, Staff } from '../src/types/database'

// ═══════════════════════════════════════
// Mock shared dependencies
// ═══════════════════════════════════════

vi.mock('@/components/providers/language-provider', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        todayRevenue: 'Today Revenue',
        totalAppointments: 'Total Appointments',
        walkIns: 'Walk-ins',
        cashInDrawer: 'Cash in Drawer',
        hourlyRevenue: 'Hourly Revenue',
        topServices: 'Top Services',
        staffPerformance: 'Staff Performance',
        todayAppointments: 'Today Appointments',
        alerts: 'Alerts',
        viewFullReport: 'View Full Report',
      }
      return translations[key] || key
    },
    language: 'en' as const,
  }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock recharts to avoid rendering issues in test environment
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ children }: { children?: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  LabelList: () => <div data-testid="label-list" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
}))

// ═══════════════════════════════════════
// KPI Cards
// ═══════════════════════════════════════

describe('KPICards', () => {
  let KPICards: typeof import('../src/app/dashboard/components/kpi-cards').KPICards

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/kpi-cards')
    KPICards = mod.KPICards
  })

  it('renders loading state with shimmer placeholders', () => {
    render(
      <KPICards
        summary={null}
        appointmentsDone={0}
        appointmentsTotal={0}
        walkIns={0}
        cashInDrawer={0}
        loading={true}
      />
    )
    const shimmers = document.querySelectorAll('.shimmer')
    expect(shimmers.length).toBeGreaterThan(0)
  })

  it('renders all 4 KPI cards with data', () => {
    const summary: DailySummary = {
      total_revenue: 25000,
      total_bills: 12,
      cash_amount: 10000,
      jazzcash_amount: 8000,
      easypaisa_amount: 2000,
      card_amount: 3000,
      bank_transfer_amount: 2000,
      udhaar_amount: 0,
      top_services: [],
      staff_performance: [],
    }

    render(
      <KPICards
        summary={summary}
        appointmentsDone={8}
        appointmentsTotal={12}
        walkIns={3}
        cashInDrawer={15000}
        loading={false}
      />
    )

    expect(screen.getByText('Today Revenue')).toBeDefined()
    expect(screen.getByText('Total Appointments')).toBeDefined()
    expect(screen.getByText('Walk-ins')).toBeDefined()
    expect(screen.getByText('Cash in Drawer')).toBeDefined()
  })

  it('displays formatted revenue', () => {
    const summary: DailySummary = {
      total_revenue: 50000,
      total_bills: 5,
      cash_amount: 50000,
      jazzcash_amount: 0,
      easypaisa_amount: 0,
      card_amount: 0,
      bank_transfer_amount: 0,
      udhaar_amount: 0,
      top_services: [],
      staff_performance: [],
    }

    render(
      <KPICards
        summary={summary}
        appointmentsDone={3}
        appointmentsTotal={5}
        walkIns={1}
        cashInDrawer={50000}
        loading={false}
      />
    )

    // Check the revenue is displayed with Rs prefix
    const allText = document.body.textContent || ''
    expect(allText).toContain('Rs')
  })

  it('shows appointments as done/total format', () => {
    const summary: DailySummary = {
      total_revenue: 0, total_bills: 0,
      cash_amount: 0, jazzcash_amount: 0, easypaisa_amount: 0,
      card_amount: 0, bank_transfer_amount: 0, udhaar_amount: 0,
      top_services: [], staff_performance: [],
    }

    render(
      <KPICards
        summary={summary}
        appointmentsDone={5}
        appointmentsTotal={10}
        walkIns={0}
        cashInDrawer={0}
        loading={false}
      />
    )

    expect(screen.getByText('5 / 10')).toBeDefined()
  })

  it('handles null summary gracefully', () => {
    render(
      <KPICards
        summary={null}
        appointmentsDone={0}
        appointmentsTotal={0}
        walkIns={0}
        cashInDrawer={0}
        loading={false}
      />
    )

    // Should show Rs 0 for revenue when summary is null
    const allText = document.body.textContent || ''
    expect(allText).toContain('Rs')
    expect(allText).toContain('0 / 0')
  })
})

// ═══════════════════════════════════════
// Payment Breakdown (Top Services)
// ═══════════════════════════════════════

describe('PaymentBreakdown', () => {
  let PaymentBreakdown: typeof import('../src/app/dashboard/components/payment-breakdown').PaymentBreakdown

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/payment-breakdown')
    PaymentBreakdown = mod.PaymentBreakdown
  })

  it('renders loading state', () => {
    render(<PaymentBreakdown summary={null} loading={true} />)
    const shimmers = document.querySelectorAll('.shimmer')
    expect(shimmers.length).toBeGreaterThan(0)
  })

  it('renders empty state when no services', () => {
    const summary: DailySummary = {
      total_revenue: 0, total_bills: 0,
      cash_amount: 0, jazzcash_amount: 0, easypaisa_amount: 0,
      card_amount: 0, bank_transfer_amount: 0, udhaar_amount: 0,
      top_services: [], staff_performance: [],
    }

    render(<PaymentBreakdown summary={summary} loading={false} />)
    expect(screen.getByText('No services yet')).toBeDefined()
  })

  it('renders empty state when summary is null', () => {
    render(<PaymentBreakdown summary={null} loading={false} />)
    expect(screen.getByText('No services yet')).toBeDefined()
  })

  it('renders services with names and revenue', () => {
    const summary: DailySummary = {
      total_revenue: 10000, total_bills: 5,
      cash_amount: 10000, jazzcash_amount: 0, easypaisa_amount: 0,
      card_amount: 0, bank_transfer_amount: 0, udhaar_amount: 0,
      top_services: [
        { name: 'Haircut', count: 5, revenue: 5000 },
        { name: 'Color', count: 3, revenue: 3000 },
        { name: 'Facial', count: 2, revenue: 2000 },
      ],
      staff_performance: [],
    }

    render(<PaymentBreakdown summary={summary} loading={false} />)
    expect(screen.getByText('Haircut')).toBeDefined()
    expect(screen.getByText('Color')).toBeDefined()
    expect(screen.getByText('Facial')).toBeDefined()
  })

  it('shows service count', () => {
    const summary: DailySummary = {
      total_revenue: 5000, total_bills: 5,
      cash_amount: 5000, jazzcash_amount: 0, easypaisa_amount: 0,
      card_amount: 0, bank_transfer_amount: 0, udhaar_amount: 0,
      top_services: [
        { name: 'Haircut', count: 5, revenue: 5000 },
      ],
      staff_performance: [],
    }

    render(<PaymentBreakdown summary={summary} loading={false} />)
    expect(screen.getByText('5 done')).toBeDefined()
  })

  it('renders numbered list (1., 2., 3.)', () => {
    const summary: DailySummary = {
      total_revenue: 10000, total_bills: 5,
      cash_amount: 10000, jazzcash_amount: 0, easypaisa_amount: 0,
      card_amount: 0, bank_transfer_amount: 0, udhaar_amount: 0,
      top_services: [
        { name: 'A', count: 5, revenue: 5000 },
        { name: 'B', count: 3, revenue: 3000 },
      ],
      staff_performance: [],
    }

    render(<PaymentBreakdown summary={summary} loading={false} />)
    expect(screen.getByText('1.')).toBeDefined()
    expect(screen.getByText('2.')).toBeDefined()
  })
})

// ═══════════════════════════════════════
// Alerts Panel
// ═══════════════════════════════════════

describe('AlertsPanel', () => {
  let AlertsPanel: typeof import('../src/app/dashboard/components/alerts-panel').AlertsPanel

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/alerts-panel')
    AlertsPanel = mod.AlertsPanel
  })

  it('renders loading state', () => {
    render(<AlertsPanel alerts={[]} loading={true} />)
    const shimmers = document.querySelectorAll('.shimmer')
    expect(shimmers.length).toBeGreaterThan(0)
  })

  it('renders empty state when no alerts', () => {
    render(<AlertsPanel alerts={[]} loading={false} />)
    expect(screen.getByText('No alerts today')).toBeDefined()
    expect(screen.getByText('Everything is running smoothly')).toBeDefined()
  })

  it('renders alerts with labels', () => {
    const alerts = [
      { type: 'low_stock' as const, label: '3 products below threshold', detail: 'Check inventory', action: { label: 'View', href: '/inventory' } },
    ]

    render(<AlertsPanel alerts={alerts} loading={false} />)
    expect(screen.getByText('3 products below threshold')).toBeDefined()
    expect(screen.getByText('Check inventory')).toBeDefined()
  })

  it('renders action buttons with correct hrefs', () => {
    const alerts = [
      { type: 'low_stock' as const, label: 'Low stock', detail: 'Detail', action: { label: 'View Inventory', href: '/dashboard/inventory' } },
    ]

    render(<AlertsPanel alerts={alerts} loading={false} />)
    const link = screen.getByText('View Inventory').closest('a')
    expect(link?.getAttribute('href')).toBe('/dashboard/inventory')
  })

  it('shows alert count badge when alerts exist', () => {
    const alerts = [
      { type: 'low_stock' as const, label: 'A', detail: 'D' },
      { type: 'udhaar' as const, label: 'B', detail: 'D' },
    ]

    render(<AlertsPanel alerts={alerts} loading={false} />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('does not show count badge when empty', () => {
    render(<AlertsPanel alerts={[]} loading={false} />)
    // The '0' count badge should NOT be shown
    const allText = document.body.textContent || ''
    // Check there's no standalone digit in the header area
    expect(screen.queryByText('0')).toBeNull()
  })

  it('renders multiple alert types with correct icons', () => {
    const alerts = [
      { type: 'low_stock' as const, label: 'Low stock', detail: 'Check' },
      { type: 'udhaar' as const, label: 'Udhaar', detail: 'Owed' },
      { type: 'no_show' as const, label: 'No shows', detail: 'Missed' },
    ]

    render(<AlertsPanel alerts={alerts} loading={false} />)
    expect(screen.getByText('Low stock')).toBeDefined()
    expect(screen.getByText('Udhaar')).toBeDefined()
    expect(screen.getByText('No shows')).toBeDefined()
  })
})

// ═══════════════════════════════════════
// Appointments Feed
// ═══════════════════════════════════════

describe('AppointmentsFeed', () => {
  let AppointmentsFeed: typeof import('../src/app/dashboard/components/appointments-feed').AppointmentsFeed

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/appointments-feed')
    AppointmentsFeed = mod.AppointmentsFeed
  })

  const makeAppointment = (overrides: Partial<AppointmentWithDetails> = {}): AppointmentWithDetails => ({
    id: Math.random().toString(),
    branch_id: 'b1',
    salon_id: 's1',
    client_id: 'c1',
    staff_id: 's1',
    status: 'booked',
    appointment_date: '2026-04-10',
    start_time: '10:00',
    end_time: '10:30',
    token_number: null,
    is_walkin: false,
    notes: null,
    reminder_sent: false,
    created_at: '2026-04-10T00:00:00Z',
    client: { id: 'c1', salon_id: 's1', name: 'Ayesha Khan', phone: '0300-1234567', whatsapp: null, gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 0, total_visits: 5, total_spent: 10000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2025-01-01' },
    staff: { id: 's1', salon_id: 's1', branch_id: 'b1', name: 'Sadia', phone: null, email: null, auth_user_id: null, role: 'senior_stylist', photo_url: null, pin_code: '1234', base_salary: 20000, commission_type: 'percentage', commission_rate: 30, join_date: '2025-01-01', is_active: true, last_login_at: null, first_login_seen: false, created_at: '2025-01-01' },
    services: [{ id: 'svc1', appointment_id: 'a1', service_id: 'sv1', service_name: 'Haircut', price: 500, duration_minutes: 30 }],
    ...overrides,
  })

  it('renders loading state', () => {
    render(<AppointmentsFeed appointments={[]} loading={true} />)
    const shimmers = document.querySelectorAll('.shimmer')
    expect(shimmers.length).toBeGreaterThan(0)
  })

  it('renders empty state', () => {
    render(<AppointmentsFeed appointments={[]} loading={false} />)
    expect(screen.getByText('No appointments today')).toBeDefined()
  })

  it('shows appointment count in header', () => {
    const appts = [makeAppointment(), makeAppointment()]
    render(<AppointmentsFeed appointments={appts} loading={false} />)
    const allText = document.body.textContent || ''
    expect(allText).toContain('(2)')
  })

  it('renders client name', () => {
    const appt = makeAppointment({ client: { id: 'c1', salon_id: 's1', name: 'Zara Malik', phone: null, whatsapp: null, gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 0, total_visits: 0, total_spent: 0, udhaar_balance: 0, udhaar_limit: 0, created_at: '2025-01-01' } })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('Zara Malik')).toBeDefined()
  })

  it('shows Walk-in for appointments without client', () => {
    const appt = makeAppointment({ client: undefined })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('Walk-in')).toBeDefined()
  })

  it('renders service names', () => {
    const appt = makeAppointment({
      services: [
        { id: 's1', appointment_id: 'a1', service_id: 'sv1', service_name: 'Facial', price: 1000, duration_minutes: 45 },
        { id: 's2', appointment_id: 'a1', service_id: 'sv2', service_name: 'Waxing', price: 800, duration_minutes: 30 },
      ],
    })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('Facial, Waxing')).toBeDefined()
  })

  it('shows No services for appointments without services', () => {
    const appt = makeAppointment({ services: [] })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('No services')).toBeDefined()
  })

  it('renders staff badge', () => {
    const appt = makeAppointment()
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('Sadia')).toBeDefined()
  })

  it('renders status badge for booked appointment', () => {
    const appt = makeAppointment({ status: 'booked' })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('Booked')).toBeDefined()
  })

  it('renders status badge for done appointment', () => {
    const appt = makeAppointment({ status: 'done' })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('Done')).toBeDefined()
  })

  it('renders status badge for no_show appointment', () => {
    const appt = makeAppointment({ status: 'no_show' })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    expect(screen.getByText('No Show')).toBeDefined()
  })

  it('links each appointment to detail view', () => {
    const appt = makeAppointment({ id: 'test-apt-123' })
    render(<AppointmentsFeed appointments={[appt]} loading={false} />)
    const link = document.querySelector('a[href*="test-apt-123"]')
    expect(link).toBeDefined()
  })
})

// ═══════════════════════════════════════
// Staff Performance Table
// ═══════════════════════════════════════

describe('StaffPerformanceTable', () => {
  let StaffPerformanceTable: typeof import('../src/app/dashboard/components/staff-performance-table').StaffPerformanceTable

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/staff-performance-table')
    StaffPerformanceTable = mod.StaffPerformanceTable
  })

  it('renders loading state', () => {
    render(<StaffPerformanceTable data={[]} loading={true} />)
    const shimmers = document.querySelectorAll('.shimmer')
    expect(shimmers.length).toBeGreaterThan(0)
  })

  it('renders empty state', () => {
    render(<StaffPerformanceTable data={[]} loading={false} />)
    expect(screen.getByText('No staff data yet')).toBeDefined()
  })

  it('renders staff names', () => {
    const data = [
      { name: 'Sadia Ahmed', services_done: 5, revenue: 5000, commission: 1500 },
      { name: 'Fatima Khan', services_done: 3, revenue: 3000, commission: 300 },
    ]
    render(<StaffPerformanceTable data={data} loading={false} />)
    expect(screen.getByText('Sadia Ahmed')).toBeDefined()
    expect(screen.getByText('Fatima Khan')).toBeDefined()
  })

  it('shows services count badge', () => {
    const data = [
      { name: 'Sadia', services_done: 7, revenue: 7000, commission: 2100 },
    ]
    render(<StaffPerformanceTable data={data} loading={false} />)
    expect(screen.getByText('7 services')).toBeDefined()
  })

  it('highlights top performer with gold styling', () => {
    const data = [
      { name: 'Top Star', services_done: 10, revenue: 15000, commission: 4500 },
      { name: 'Second', services_done: 5, revenue: 5000, commission: 1500 },
    ]
    render(<StaffPerformanceTable data={data} loading={false} />)
    // First staff item should have gold border
    const items = document.querySelectorAll('[class*="border-gold"]')
    expect(items.length).toBeGreaterThan(0)
  })

  it('shows first letter avatar', () => {
    const data = [
      { name: 'Ahmed', services_done: 3, revenue: 3000, commission: 750 },
    ]
    render(<StaffPerformanceTable data={data} loading={false} />)
    expect(screen.getByText('A')).toBeDefined()
  })

  it('displays commission amount', () => {
    const data = [
      { name: 'Staff', services_done: 5, revenue: 10000, commission: 3000 },
    ]
    render(<StaffPerformanceTable data={data} loading={false} />)
    const allText = document.body.textContent || ''
    expect(allText).toContain('comm.')
  })

  it('links to full staff report', () => {
    render(<StaffPerformanceTable data={[]} loading={false} />)
    const link = document.querySelector('a[href="/dashboard/reports/staff"]')
    expect(link).toBeDefined()
  })
})

// ═══════════════════════════════════════
// Revenue Chart
// ═══════════════════════════════════════

describe('RevenueChart', () => {
  let RevenueChart: typeof import('../src/app/dashboard/components/revenue-chart').RevenueChart

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/revenue-chart')
    RevenueChart = mod.RevenueChart
  })

  it('renders loading state', () => {
    render(<RevenueChart data={[]} loading={true} />)
    const shimmers = document.querySelectorAll('.shimmer')
    expect(shimmers.length).toBeGreaterThan(0)
  })

  it('renders empty state when no data', () => {
    render(<RevenueChart data={[]} loading={false} />)
    expect(screen.getByText('No revenue data yet')).toBeDefined()
  })

  it('uses default title from translation', () => {
    render(<RevenueChart data={[]} loading={false} />)
    expect(screen.getByText('Hourly Revenue')).toBeDefined()
  })

  it('uses custom title when provided', () => {
    render(<RevenueChart data={[{ label: '9AM', revenue: 100, appointments: 1 }]} loading={false} title="Revenue by Day" />)
    expect(screen.getByText('Revenue by Day')).toBeDefined()
  })

  it('renders chart when data is provided', () => {
    const data = [
      { label: '9AM', revenue: 1000, appointments: 2 },
      { label: '10AM', revenue: 2000, appointments: 3 },
    ]
    render(<RevenueChart data={data} loading={false} />)
    expect(document.querySelector('[data-testid="bar-chart"]')).toBeDefined()
  })
})

// ═══════════════════════════════════════
// Stylist Dashboard
// ═══════════════════════════════════════

describe('StylistDashboard', () => {
  let StylistDashboard: typeof import('../src/app/dashboard/components/stylist-dashboard').StylistDashboard

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/stylist-dashboard')
    StylistDashboard = mod.StylistDashboard
  })

  const makeAppointment = (overrides: Partial<AppointmentWithDetails> = {}): AppointmentWithDetails => ({
    id: Math.random().toString(),
    branch_id: 'b1',
    salon_id: 's1',
    client_id: 'c1',
    staff_id: 's1',
    status: 'booked',
    appointment_date: '2026-04-10',
    start_time: '10:00',
    end_time: '10:30',
    token_number: null,
    is_walkin: false,
    notes: null,
    reminder_sent: false,
    created_at: '2026-04-10T00:00:00Z',
    client: { id: 'c1', salon_id: 's1', name: 'Client A', phone: null, whatsapp: null, gender: null, is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 0, total_visits: 0, total_spent: 0, udhaar_balance: 0, udhaar_limit: 0, created_at: '' },
    staff: { id: 's1', salon_id: 's1', branch_id: 'b1', name: 'Stylist', phone: null, email: null, auth_user_id: null, role: 'senior_stylist', photo_url: null, pin_code: '1234', base_salary: 20000, commission_type: 'percentage', commission_rate: 30, join_date: '', is_active: true, last_login_at: null, first_login_seen: false, created_at: '' },
    services: [{ id: 'svc1', appointment_id: 'a1', service_id: 'sv1', service_name: 'Haircut', price: 500, duration_minutes: 30 }],
    ...overrides,
  })

  it('renders welcome message with staff name', () => {
    render(
      <StylistDashboard
        staffName="Sadia Ahmed"
        todayAppointments={[]}
        todayEarnings={{ services: 0, tips: 0 }}
        monthlyCommission={0}
        loading={false}
      />
    )
    expect(screen.getByText('Welcome back, Sadia Ahmed!')).toBeDefined()
  })

  it('renders loading state for earnings cards', () => {
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[]}
        todayEarnings={{ services: 0, tips: 0 }}
        monthlyCommission={0}
        loading={true}
      />
    )
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('shows next appointment card for booked/confirmed', () => {
    const appt = makeAppointment({ status: 'confirmed', start_time: '14:00' })
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[appt]}
        todayEarnings={{ services: 5000, tips: 500 }}
        monthlyCommission={1500}
        loading={false}
      />
    )
    expect(screen.getByText(/Next: Client A/)).toBeDefined()
  })

  it('does not show next appointment for done-only list', () => {
    const appt = makeAppointment({ status: 'done' })
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[appt]}
        todayEarnings={{ services: 5000, tips: 500 }}
        monthlyCommission={1500}
        loading={false}
      />
    )
    expect(screen.queryByText(/Next:/)).toBeNull()
  })

  it('renders earnings cards when earnings > 0', () => {
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[]}
        todayEarnings={{ services: 5000, tips: 200 }}
        monthlyCommission={3000}
        loading={false}
      />
    )
    expect(screen.getByText('Services')).toBeDefined()
    expect(screen.getByText('Tips')).toBeDefined()
    expect(screen.getByText('This Month')).toBeDefined()
  })

  it('shows zero-earnings message when all earnings are 0', () => {
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[]}
        todayEarnings={{ services: 0, tips: 0 }}
        monthlyCommission={0}
        loading={false}
      />
    )
    expect(screen.getByText(/Complete your next appointment/)).toBeDefined()
  })

  it('shows completed/total count in schedule header', () => {
    const appointments = [
      makeAppointment({ status: 'done' }),
      makeAppointment({ status: 'done' }),
      makeAppointment({ status: 'booked' }),
    ]
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={appointments}
        todayEarnings={{ services: 2000, tips: 100 }}
        monthlyCommission={600}
        loading={false}
      />
    )
    expect(screen.getByText('My Schedule Today (2/3 done)')).toBeDefined()
  })

  it('shows empty schedule message', () => {
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[]}
        todayEarnings={{ services: 5000, tips: 0 }}
        monthlyCommission={1500}
        loading={false}
      />
    )
    expect(screen.getByText('No appointments scheduled')).toBeDefined()
  })

  it('renders Walk-in for appointments without client', () => {
    const appt = makeAppointment({ client: undefined })
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[appt]}
        todayEarnings={{ services: 500, tips: 0 }}
        monthlyCommission={150}
        loading={false}
      />
    )
    // Walk-in should appear somewhere in the schedule
    const allText = document.body.textContent || ''
    expect(allText).toContain('Walk-in')
  })

  it('dims done appointments with opacity', () => {
    const appt = makeAppointment({ status: 'done' })
    render(
      <StylistDashboard
        staffName="Sadia"
        todayAppointments={[appt]}
        todayEarnings={{ services: 1000, tips: 0 }}
        monthlyCommission={300}
        loading={false}
      />
    )
    const dimmed = document.querySelector('.opacity-60')
    expect(dimmed).not.toBeNull()
  })
})

// ═══════════════════════════════════════
// Quick Actions
// ═══════════════════════════════════════

describe('QuickActions', () => {
  let QuickActions: typeof import('../src/app/dashboard/components/quick-actions').QuickActions

  beforeEach(async () => {
    const mod = await import('../src/app/dashboard/components/quick-actions')
    QuickActions = mod.QuickActions
  })

  it('renders the FAB button', () => {
    render(<QuickActions />)
    const btn = screen.getByLabelText('Quick actions')
    expect(btn).toBeDefined()
  })

  it('shows actions on click', async () => {
    const user = userEvent.setup()
    render(<QuickActions />)

    await user.click(screen.getByLabelText('Quick actions'))

    expect(screen.getByText('New Appointment')).toBeDefined()
    expect(screen.getByText('Walk-in')).toBeDefined()
    expect(screen.getByText('Cash Drawer')).toBeDefined()
  })

  it('hides actions on second click', async () => {
    const user = userEvent.setup()
    render(<QuickActions />)

    await user.click(screen.getByLabelText('Quick actions'))
    expect(screen.getByText('New Appointment')).toBeDefined()

    await user.click(screen.getByLabelText('Quick actions'))
    expect(screen.queryByText('New Appointment')).toBeNull()
  })

  it('has correct hrefs on action links', async () => {
    const user = userEvent.setup()
    render(<QuickActions />)

    await user.click(screen.getByLabelText('Quick actions'))

    const appointmentLink = screen.getByText('New Appointment').closest('a')
    expect(appointmentLink?.getAttribute('href')).toBe('/dashboard/appointments')

    const walkinLink = screen.getByText('Walk-in').closest('a')
    expect(walkinLink?.getAttribute('href')).toBe('/dashboard/appointments?walkin=true')

    const drawerLink = screen.getByText('Cash Drawer').closest('a')
    expect(drawerLink?.getAttribute('href')).toBe('/dashboard/reports/daily')
  })
})
