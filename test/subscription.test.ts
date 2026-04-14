import { describe, it, expect } from 'vitest'
import type { SubscriptionPlan, SubscriptionStatus } from '../src/types/database'

// ═══════════════════════════════════════
// Subscription paywall logic tests
// ═══════════════════════════════════════

const PLAN_LIMITS: Record<string, { branches: number; staff: number }> = {
  none: { branches: 0, staff: 0 },
  basic: { branches: 1, staff: 3 },
  growth: { branches: 1, staff: 0 },
  pro: { branches: 3, staff: 0 },
}

function isReadOnly(status: SubscriptionStatus): boolean {
  return status !== 'active'
}

function canAddBranch(plan: SubscriptionPlan, currentCount: number): { allowed: boolean; reason?: string } {
  const limits = PLAN_LIMITS[plan]
  if (!limits || limits.branches === 0) return { allowed: false, reason: 'No plan selected' }
  if (currentCount >= limits.branches) {
    return { allowed: false, reason: `Your ${plan} plan allows ${limits.branches} branch${limits.branches > 1 ? 'es' : ''}.` }
  }
  return { allowed: true }
}

function canAddStaff(plan: SubscriptionPlan, currentCount: number): { allowed: boolean; reason?: string } {
  const limits = PLAN_LIMITS[plan]
  if (!limits) return { allowed: false, reason: 'No plan selected' }
  if (limits.staff === 0) return { allowed: true } // unlimited
  if (currentCount >= limits.staff) {
    return { allowed: false, reason: `Your ${plan} plan allows ${limits.staff} staff members.` }
  }
  return { allowed: true }
}

describe('subscription read-only enforcement', () => {
  it('pending status is read-only', () => {
    expect(isReadOnly('pending')).toBe(true)
  })

  it('expired status is read-only', () => {
    expect(isReadOnly('expired')).toBe(true)
  })

  it('suspended status is read-only', () => {
    expect(isReadOnly('suspended')).toBe(true)
  })

  it('active status is NOT read-only', () => {
    expect(isReadOnly('active')).toBe(false)
  })
})

describe('branch limit enforcement', () => {
  it('none plan cannot add any branches', () => {
    const result = canAddBranch('none', 0)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('No plan')
  })

  it('basic plan allows 1 branch', () => {
    expect(canAddBranch('basic', 0).allowed).toBe(true)
  })

  it('basic plan blocks at 1 branch', () => {
    const result = canAddBranch('basic', 1)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('1 branch')
  })

  it('growth plan allows 1 branch', () => {
    expect(canAddBranch('growth', 0).allowed).toBe(true)
  })

  it('growth plan blocks at 1 branch', () => {
    expect(canAddBranch('growth', 1).allowed).toBe(false)
  })

  it('pro plan allows up to 3 branches', () => {
    expect(canAddBranch('pro', 0).allowed).toBe(true)
    expect(canAddBranch('pro', 1).allowed).toBe(true)
    expect(canAddBranch('pro', 2).allowed).toBe(true)
  })

  it('pro plan blocks at 3 branches', () => {
    const result = canAddBranch('pro', 3)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('3 branches')
  })
})

describe('staff limit enforcement', () => {
  it('basic plan allows up to 3 staff', () => {
    expect(canAddStaff('basic', 0).allowed).toBe(true)
    expect(canAddStaff('basic', 1).allowed).toBe(true)
    expect(canAddStaff('basic', 2).allowed).toBe(true)
  })

  it('basic plan blocks at 3 staff', () => {
    const result = canAddStaff('basic', 3)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('3 staff')
  })

  it('growth plan has unlimited staff', () => {
    expect(canAddStaff('growth', 0).allowed).toBe(true)
    expect(canAddStaff('growth', 50).allowed).toBe(true)
    expect(canAddStaff('growth', 100).allowed).toBe(true)
  })

  it('pro plan has unlimited staff', () => {
    expect(canAddStaff('pro', 0).allowed).toBe(true)
    expect(canAddStaff('pro', 999).allowed).toBe(true)
  })
})

describe('subscription plan types', () => {
  it('valid plans are none, basic, growth, pro', () => {
    const validPlans: SubscriptionPlan[] = ['none', 'basic', 'growth', 'pro']
    validPlans.forEach((p) => {
      expect(PLAN_LIMITS[p]).toBeDefined()
    })
  })

  it('valid statuses are pending, active, expired, suspended', () => {
    const validStatuses: SubscriptionStatus[] = ['pending', 'active', 'expired', 'suspended']
    validStatuses.forEach((s) => {
      expect(typeof isReadOnly(s)).toBe('boolean')
    })
  })
})
