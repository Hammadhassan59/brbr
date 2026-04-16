import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the update mock so tests can assert on it
const mockUpdateEq = vi.fn().mockReturnValue({ error: null })
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      update: mockUpdate,
      select: (_cols: string, _opts?: unknown) => ({
        eq: (_col: string, _val: string) => ({
          gte: (_col2: string, _val2: string) => Promise.resolve({ data: [], error: null }),
          order: (_col2: string, _opts?: unknown) => ({
            limit: (_n: number) => Promise.resolve({ data: [], error: null }),
          }),
          single: () => Promise.resolve({ data: null, error: null }),
          then: (cb: (v: { data: unknown[]; count: number | null; error: null }) => unknown) =>
            Promise.resolve({ data: [], count: 0, error: null }).then(cb),
        }),
        order: (_col: string, _opts?: unknown) => Promise.resolve({ data: [], error: null }),
        then: (cb: (v: { data: unknown[]; count: number | null; error: null }) => unknown) =>
          Promise.resolve({ data: [], count: 0, error: null }).then(cb),
      }),
    }),
  }),
}))

const mockVerifySession = vi.fn().mockResolvedValue({
  salonId: 'salon-1',
  staffId: 'staff-1',
  role: 'super_admin',
})

vi.mock('@/app/actions/auth', () => ({
  verifySession: mockVerifySession,
  requireAdminRole: async (allowed: string[]) => {
    const s = await mockVerifySession()
    if (!s || !allowed.includes(s.role)) throw new Error('Unauthorized')
    return s
  },
}))

describe('admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default super_admin role
    mockVerifySession.mockResolvedValue({ salonId: 'salon-1', staffId: 'staff-1', role: 'super_admin' })
    // Restore default update mock
    mockUpdateEq.mockReturnValue({ error: null })
    mockUpdate.mockReturnValue({ eq: mockUpdateEq })
  })

  it('updateSalon calls update on the salons table', async () => {
    const { updateSalon } = await import('../src/app/actions/admin')
    const result = await updateSalon('salon-123', { name: 'New Name', city: 'Lahore' })
    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'New Name', city: 'Lahore' })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'salon-123')
  })

  it('updateSubscription calls update with subscription fields', async () => {
    const { updateSubscription } = await import('../src/app/actions/admin')
    const result = await updateSubscription('salon-123', {
      subscription_plan: 'pro',
      subscription_status: 'active',
      subscription_expires_at: '2027-01-01T00:00:00Z',
    })
    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({
      subscription_plan: 'pro',
      subscription_status: 'active',
      subscription_expires_at: '2027-01-01T00:00:00Z',
    })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'salon-123')
  })

  it('updateSalon rejects non-superadmin', async () => {
    mockVerifySession.mockResolvedValue({ salonId: 'salon-1', staffId: 'staff-1', role: 'owner' })
    const { updateSalon } = await import('../src/app/actions/admin')
    await expect(updateSalon('salon-123', { name: 'Hack' })).rejects.toThrow('Unauthorized')
  })
})
