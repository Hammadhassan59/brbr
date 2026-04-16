import { describe, it, expect, vi, beforeEach } from 'vitest'

// Holds what the mock supabase client returns for the single .select().in() call
// getPublicPlatformConfig issues.
let mockSelectInResponse: { data: Array<{ key: string; value: unknown }> | null } = { data: [] }

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve(mockSelectInResponse),
      }),
    }),
  }),
}))

// getPublicPlatformConfig has no auth, but savePlatformSetting does — stub
// verifySession as super_admin for safety even though we don't exercise it here.
vi.mock('@/app/actions/auth', () => ({
  verifySession: vi.fn().mockResolvedValue({ salonId: 's', staffId: 'u', role: 'super_admin' }),
  requireAdminRole: async (_allowed: string[]) => ({ salonId: 's', staffId: 'u', role: 'super_admin' }),
}))

import { getPublicPlatformConfig } from '@/app/actions/admin-settings'

describe('getPublicPlatformConfig — marketing field fallbacks', () => {
  beforeEach(() => {
    mockSelectInResponse = { data: [] }
  })

  it('returns full marketing defaults when no rows in DB', async () => {
    mockSelectInResponse = { data: [] }
    const cfg = await getPublicPlatformConfig()

    expect(cfg.plans.basic.displayName).toBe('Starter')
    expect(cfg.plans.basic.originalPrice).toBe(5000)
    expect(cfg.plans.basic.pitch).toBe('For new and small salons')
    expect(cfg.plans.basic.popular).toBe(false)
    expect(cfg.plans.basic.features.length).toBeGreaterThan(0)

    expect(cfg.plans.growth.displayName).toBe('Business')
    expect(cfg.plans.growth.popular).toBe(true)

    expect(cfg.plans.pro.displayName).toBe('Enterprise')
    expect(cfg.plans.pro.originalPrice).toBe(20000)

    expect(cfg.payment.bankAccount).toBe('')
    expect(cfg.payment.jazzcashAccount).toBe('')
    expect(cfg.supportWhatsApp).toBe('')
  })

  it('merges DB price/branches/staff over marketing defaults', async () => {
    mockSelectInResponse = {
      data: [
        {
          key: 'plans',
          value: {
            basic: { price: 2999, branches: 2, staff: 5 },
          },
        },
      ],
    }
    const cfg = await getPublicPlatformConfig()

    // DB values win for operational fields
    expect(cfg.plans.basic.price).toBe(2999)
    expect(cfg.plans.basic.branches).toBe(2)
    expect(cfg.plans.basic.staff).toBe(5)
    // Marketing fields still come from defaults since DB didn't specify them
    expect(cfg.plans.basic.displayName).toBe('Starter')
    expect(cfg.plans.basic.pitch).toBe('For new and small salons')
  })

  it('uses admin-set marketing copy over defaults', async () => {
    mockSelectInResponse = {
      data: [
        {
          key: 'plans',
          value: {
            basic: {
              price: 1000,
              displayName: 'Bronze',
              pitch: 'Cheapest',
              limits: 'tiny',
              originalPrice: 1500,
              popular: true,
              features: [{ text: 'Thing', ok: true }, { text: 'Other', ok: false }],
            },
          },
        },
      ],
    }
    const cfg = await getPublicPlatformConfig()

    expect(cfg.plans.basic.displayName).toBe('Bronze')
    expect(cfg.plans.basic.pitch).toBe('Cheapest')
    expect(cfg.plans.basic.limits).toBe('tiny')
    expect(cfg.plans.basic.originalPrice).toBe(1500)
    expect(cfg.plans.basic.popular).toBe(true)
    expect(cfg.plans.basic.features).toEqual([
      { text: 'Thing', ok: true },
      { text: 'Other', ok: false },
    ])
  })

  it('coerces string-shorthand features with ~ prefix', async () => {
    // We accept string[] as a convenience so migrations / manual DB edits work.
    // "~ foo" → { text: 'foo', ok: false }
    mockSelectInResponse = {
      data: [
        {
          key: 'plans',
          value: {
            basic: { features: ['POS', '~ Inventory', '  ~Payroll'] },
          },
        },
      ],
    }
    const cfg = await getPublicPlatformConfig()

    expect(cfg.plans.basic.features).toEqual([
      { text: 'POS', ok: true },
      { text: 'Inventory', ok: false },
      { text: 'Payroll', ok: false },
    ])
  })

  it('returns payment and support whatsapp when set', async () => {
    mockSelectInResponse = {
      data: [
        { key: 'payment', value: { bankAccount: 'HBL 123', jazzcashAccount: '0300-111' } },
        { key: 'general', value: { supportWhatsApp: '+923001234567' } },
      ],
    }
    const cfg = await getPublicPlatformConfig()
    expect(cfg.payment.bankAccount).toBe('HBL 123')
    expect(cfg.payment.jazzcashAccount).toBe('0300-111')
    expect(cfg.supportWhatsApp).toBe('+923001234567')
  })

  it('falls back to price defaults when DB price is 0 or missing', async () => {
    mockSelectInResponse = {
      data: [
        { key: 'plans', value: { basic: { price: 0 } } },
      ],
    }
    const cfg = await getPublicPlatformConfig()
    // price 0 is treated as "unset" — defaults back to 2500
    expect(cfg.plans.basic.price).toBe(2500)
  })
})
