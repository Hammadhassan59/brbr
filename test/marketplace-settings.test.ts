import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  allRequirementsMet,
  type ListingRequirements,
} from '../src/lib/marketplace/settings-shared';
import { GenderTypeSchema } from '../src/lib/schemas/common';

// ═══════════════════════════════════════
// gender_type requirement regression
//
// Migration 041 adds `branches.gender_type salon_gender_type NOT NULL`
// semantics for marketplace-listed branches. The publish gate must keep the
// toggle disabled until the owner picks one of 'men' | 'women' | 'mixed'.
// ═══════════════════════════════════════

function fullyMetExceptGender(): ListingRequirements {
  return {
    hasThreePhotos: true,
    hasAbout: true,
    hasPin: true,
    hasCity: true,
    hasActiveService: true,
    hasGenderType: false,
  };
}

describe('allRequirementsMet — gender_type gating', () => {
  it('returns false when every requirement except gender_type is met', () => {
    expect(allRequirementsMet(fullyMetExceptGender())).toBe(false);
  });

  it('returns true once gender_type is set with every other field met', () => {
    expect(
      allRequirementsMet({ ...fullyMetExceptGender(), hasGenderType: true }),
    ).toBe(true);
  });
});

describe('GenderTypeSchema', () => {
  it('accepts the three enum values', () => {
    expect(GenderTypeSchema.safeParse('men').success).toBe(true);
    expect(GenderTypeSchema.safeParse('women').success).toBe(true);
    expect(GenderTypeSchema.safeParse('mixed').success).toBe(true);
  });

  it('rejects anything else', () => {
    expect(GenderTypeSchema.safeParse('').success).toBe(false);
    expect(GenderTypeSchema.safeParse('unisex').success).toBe(false);
    expect(GenderTypeSchema.safeParse('MEN').success).toBe(false);
    expect(GenderTypeSchema.safeParse(null).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// updateMarketplaceListing — server-side publish gate regression
// ─────────────────────────────────────────────────────────────────────────

const TEST_SESSION = {
  salonId: 'salon-1',
  staffId: 'staff-1',
  role: 'owner' as const,
  branchId: '11111111-2222-4333-8444-555555555555',
  primaryBranchId: '11111111-2222-4333-8444-555555555555',
  branchIds: ['11111111-2222-4333-8444-555555555555'],
  permissions: { '*': true },
  name: 'Test',
};

vi.mock('@/app/actions/auth', () => ({
  checkWriteAccess: vi.fn().mockResolvedValue({
    session: TEST_SESSION,
    error: null,
  }),
  verifySession: vi.fn().mockResolvedValue(TEST_SESSION),
}));

vi.mock('@/lib/tenant-guard', () => ({
  assertBranchOwned: vi.fn().mockResolvedValue(undefined),
  requirePermission: vi.fn(),
  tenantErrorMessage: () => null,
}));

// The action's getMarketplaceSettings precheck reads `branches`, `cities`,
// and `services`. We stage the state so publish attempts see every
// requirement satisfied EXCEPT gender_type, then assert the action refuses
// to flip listed_on_marketplace.
type BranchRow = {
  id: string;
  name: string;
  listed_on_marketplace: boolean;
  offers_home_service: boolean;
  home_service_radius_km: number | null;
  about: string | null;
  city_id: string | null;
  lat: number | null;
  lng: number | null;
  photos: Array<{ path: string; url: string; uploaded_at: string }>;
  gender_type: 'men' | 'women' | 'mixed' | null;
};

const state: { branch: BranchRow } = {
  branch: {
    id: '11111111-2222-4333-8444-555555555555',
    name: 'Main',
    listed_on_marketplace: false,
    offers_home_service: false,
    home_service_radius_km: null,
    about: 'x'.repeat(150),
    city_id: '22222222-3333-4444-8555-666666666666',
    lat: 24.86,
    lng: 67.01,
    photos: [
      { path: 'a', url: 'a', uploaded_at: '2026-04-18T00:00:00Z' },
      { path: 'b', url: 'b', uploaded_at: '2026-04-18T00:00:00Z' },
      { path: 'c', url: 'c', uploaded_at: '2026-04-18T00:00:00Z' },
    ],
    gender_type: null,
  },
};

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'branches') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { ...state.branch },
                  error: null,
                }),
              }),
            }),
          }),
          update: (fields: Partial<BranchRow>) => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => {
                    Object.assign(state.branch, fields);
                    return { data: { ...state.branch }, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'cities') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ id: '22222222-3333-4444-8555-666666666666', slug: 'karachi', name: 'Karachi' }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'services') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ data: null, count: 3, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

describe('updateMarketplaceListing — publish blocked without gender_type', () => {
  beforeEach(() => {
    state.branch.gender_type = null;
    state.branch.listed_on_marketplace = false;
    vi.clearAllMocks();
  });

  it('refuses to flip listed_on_marketplace when gender_type is null', async () => {
    const { updateMarketplaceListing } = await import(
      '../src/app/actions/marketplace-settings'
    );

    const res = await updateMarketplaceListing({
      branchId: '11111111-2222-4333-8444-555555555555',
      listed_on_marketplace: true,
    });

    expect(res.data).toBeNull();
    expect(res.error).toBeTruthy();
    expect(res.error).toMatch(/salon type|gender|checklist/i);
    expect(state.branch.listed_on_marketplace).toBe(false);
  });

  it('publishes successfully once gender_type is provided in the same save', async () => {
    const { updateMarketplaceListing } = await import(
      '../src/app/actions/marketplace-settings'
    );

    const res = await updateMarketplaceListing({
      branchId: '11111111-2222-4333-8444-555555555555',
      listed_on_marketplace: true,
      gender_type: 'men',
    });

    expect(res.error).toBeNull();
    expect(state.branch.listed_on_marketplace).toBe(true);
    expect(state.branch.gender_type).toBe('men');
  });
});
