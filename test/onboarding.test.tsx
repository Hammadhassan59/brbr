import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/providers/language-provider', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        noClientsYet: 'No clients yet',
        addClient: 'Add Client',
        noAppointmentsYet: 'No appointments yet',
        noDataYet: 'No data yet',
        gettingStarted: 'Getting Started',
        complete: 'complete',
        dismiss: 'Dismiss',
        allSet: "You're all set!",
        addFirstClient: 'Add first client',
        bookAppointment: 'Book appointment',
        completeSale: 'Complete a sale',
        paymentMethods: 'Payment methods',
        inviteStaff: 'Invite staff',
        letsGo: "Got it, let's go",
        welcomeGreeting: 'Welcome, {name}!',
        roleAt: "You're logged in as {role} at {salon}",
      }
      return translations[key] || key
    },
    language: 'en' as const,
    isUrdu: false,
    setLanguage: vi.fn(),
  }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// ═══════════════════════════════════════
// OnboardingBanner
// ═══════════════════════════════════════

vi.mock('@/app/actions/onboarding', () => ({
  getOnboardingStatus: vi.fn().mockResolvedValue({
    has_clients: false,
    has_appointments: false,
    has_sale: false,
    has_payment_methods: false,
    staff_logged_in: false,
    onboarding_dismissed: false,
  }),
  dismissOnboarding: vi.fn().mockResolvedValue({ success: true }),
  markFirstLoginSeen: vi.fn().mockResolvedValue({ success: true }),
}))

describe('OnboardingBanner', () => {
  let OnboardingBanner: typeof import('../src/app/dashboard/components/onboarding-banner').OnboardingBanner

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/app/dashboard/components/onboarding-banner')
    OnboardingBanner = mod.OnboardingBanner
  })

  it('renders the getting started title', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    await vi.waitFor(() => {
      expect(screen.getByText('Getting Started')).toBeDefined()
    })
  })

  it('renders all 5 checklist items', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    await vi.waitFor(() => {
      expect(screen.getByText('Add first client')).toBeDefined()
      expect(screen.getByText('Book appointment')).toBeDefined()
      expect(screen.getByText('Complete a sale')).toBeDefined()
      expect(screen.getByText('Payment methods')).toBeDefined()
      expect(screen.getByText('Invite staff')).toBeDefined()
    })
  })

  it('shows progress count', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    await vi.waitFor(() => {
      expect(screen.getByText(/0\/5/)).toBeDefined()
    })
  })

  it('renders dismiss button', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    await vi.waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeDefined()
    })
  })
})

// ═══════════════════════════════════════
// EmptyState
// ═══════════════════════════════════════

describe('EmptyState', () => {
  let EmptyState: typeof import('../src/components/empty-state').EmptyState

  beforeEach(async () => {
    const mod = await import('../src/components/empty-state')
    EmptyState = mod.EmptyState
  })

  it('renders icon and text', () => {
    render(<EmptyState icon="👤" text="noClientsYet" />)
    expect(screen.getByText('👤')).toBeDefined()
    expect(screen.getByText('No clients yet')).toBeDefined()
  })

  it('renders CTA button with link when provided', () => {
    render(<EmptyState icon="👤" text="noClientsYet" ctaLabel="addClient" ctaHref="/dashboard/clients?action=new" />)
    const link = screen.getByText('Add Client')
    expect(link.closest('a')).toBeDefined()
    expect(link.closest('a')?.getAttribute('href')).toBe('/dashboard/clients?action=new')
  })

  it('renders without CTA when no ctaLabel provided', () => {
    render(<EmptyState icon="📊" text="noDataYet" />)
    expect(screen.getByText('No data yet')).toBeDefined()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

// ═══════════════════════════════════════
// StaffWelcome
// ═══════════════════════════════════════

describe('StaffWelcome', () => {
  let StaffWelcome: typeof import('../src/app/dashboard/components/staff-welcome').StaffWelcome

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/app/dashboard/components/staff-welcome')
    StaffWelcome = mod.StaffWelcome
  })

  it('renders welcome greeting with name', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText(/Welcome, Sadia!/)).toBeDefined()
  })

  it('renders role and salon name', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText(/Senior Stylist/)).toBeDefined()
    expect(screen.getByText(/Glamour Studio/)).toBeDefined()
  })

  it('renders the CTA button', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText("Got it, let's go")).toBeDefined()
  })

  it('shows 3 capabilities for stylist role', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText('Your appointments')).toBeDefined()
    expect(screen.getByText('Your earnings & commissions')).toBeDefined()
    expect(screen.getByText('Your daily schedule')).toBeDefined()
  })

  it('shows manager capabilities for manager role', () => {
    render(<StaffWelcome name="Fatima" role="manager" salonName="Glamour Studio" />)
    expect(screen.getByText('Full dashboard & reports')).toBeDefined()
    expect(screen.getByText('Staff & client management')).toBeDefined()
    expect(screen.getByText('POS & appointments')).toBeDefined()
  })

  it('shows receptionist capabilities', () => {
    render(<StaffWelcome name="Zainab" role="receptionist" salonName="Glamour Studio" />)
    expect(screen.getByText('Appointments & walk-ins')).toBeDefined()
    expect(screen.getByText('Client management')).toBeDefined()
    expect(screen.getByText('POS & checkout')).toBeDefined()
  })
})
