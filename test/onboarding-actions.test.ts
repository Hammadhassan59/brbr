import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ error: null }) })
const mockRpc = vi.fn().mockResolvedValue({ data: {
  has_clients: false,
  has_appointments: false,
  has_sale: false,
  has_payment_methods: false,
  staff_logged_in: false,
  onboarding_dismissed: false,
}, error: null })

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => ({ update: (data: Record<string, unknown>) => ({ eq: (_col: string, _val: string) => ({ error: null }) }) }),
    rpc: mockRpc,
  }),
}))

vi.mock('@/app/actions/auth', () => ({
  verifySession: vi.fn().mockResolvedValue({ salonId: 'salon-1', staffId: 'staff-1', role: 'owner' }),
  verifyWriteAccess: vi.fn().mockResolvedValue({ salonId: 'salon-1', staffId: 'staff-1', role: 'owner' }),
}))

describe('onboarding actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getOnboardingStatus returns status object', async () => {
    const { getOnboardingStatus } = await import('../src/app/actions/onboarding')
    const result = await getOnboardingStatus()
    expect(result).toHaveProperty('has_clients')
    expect(result).toHaveProperty('onboarding_dismissed')
  })

  it('dismissOnboarding calls update on salons table', async () => {
    const { dismissOnboarding } = await import('../src/app/actions/onboarding')
    const result = await dismissOnboarding()
    expect(result).toEqual({ success: true })
  })

  it('markFirstLoginSeen calls update on staff table', async () => {
    const { markFirstLoginSeen } = await import('../src/app/actions/onboarding')
    const result = await markFirstLoginSeen()
    expect(result).toEqual({ success: true })
  })
})
