import { describe, it, expect } from 'vitest';
import { isDemoBranchId, getDemoBranchFixture } from '../src/lib/demo-branch-fixtures';
import {
  DEMO_BRANCH,
  DEMO_BRANCH_GENTS,
  DEMO_BRANCH_GENTS_2,
} from '../src/lib/demo-data';

describe('isDemoBranchId', () => {
  it('returns true for known demo branch IDs', () => {
    expect(isDemoBranchId(DEMO_BRANCH.id)).toBe(true);
    expect(isDemoBranchId(DEMO_BRANCH_GENTS.id)).toBe(true);
    expect(isDemoBranchId(DEMO_BRANCH_GENTS_2.id)).toBe(true);
  });

  it('returns false for unknown IDs', () => {
    expect(isDemoBranchId('unknown-uuid')).toBe(false);
    expect(isDemoBranchId('99999999-9999-9999-9999-999999999999')).toBe(false);
  });

  it('returns false for null or undefined', () => {
    expect(isDemoBranchId(null)).toBe(false);
    expect(isDemoBranchId(undefined)).toBe(false);
    expect(isDemoBranchId('')).toBe(false);
  });
});

describe('getDemoBranchFixture', () => {
  it('returns Glamour Studio fixture with 2 stylists', () => {
    const f = getDemoBranchFixture(DEMO_BRANCH.id);
    expect(f).not.toBeNull();
    expect(f!.branch.name).toBe('Gulberg Branch');
    expect(f!.stylists).toHaveLength(2);
    expect(f!.stylists.map((s) => s.name)).toContain('Fatima Khan');
    expect(f!.stylists.map((s) => s.name)).toContain('Sadia Ahmed');
  });

  it('returns Royal Barbers F-7 fixture with 3 stylists', () => {
    const f = getDemoBranchFixture(DEMO_BRANCH_GENTS.id);
    expect(f).not.toBeNull();
    expect(f!.branch.name).toBe('F-7 Markaz');
    expect(f!.stylists).toHaveLength(3);
    expect(f!.stylists.map((s) => s.name)).toContain('Ahmed Raza');
  });

  it('returns Blue Area fixture with 2 stylists', () => {
    const f = getDemoBranchFixture(DEMO_BRANCH_GENTS_2.id);
    expect(f).not.toBeNull();
    expect(f!.branch.name).toBe('Blue Area');
    expect(f!.stylists).toHaveLength(2);
  });

  it('returns null for unknown IDs', () => {
    expect(getDemoBranchFixture('unknown')).toBeNull();
    expect(getDemoBranchFixture(null)).toBeNull();
    expect(getDemoBranchFixture(undefined)).toBeNull();
  });

  it('every returned stylist has a role appropriate for the calendar query', () => {
    const validRoles = ['senior_stylist', 'junior_stylist', 'owner', 'manager'];
    const ids = [DEMO_BRANCH.id, DEMO_BRANCH_GENTS.id, DEMO_BRANCH_GENTS_2.id];
    for (const id of ids) {
      const f = getDemoBranchFixture(id);
      expect(f).not.toBeNull();
      for (const s of f!.stylists) {
        expect(validRoles).toContain(s.role);
      }
    }
  });

  it('every returned stylist belongs to the returned branch', () => {
    const ids = [DEMO_BRANCH.id, DEMO_BRANCH_GENTS.id, DEMO_BRANCH_GENTS_2.id];
    for (const id of ids) {
      const f = getDemoBranchFixture(id);
      expect(f).not.toBeNull();
      for (const s of f!.stylists) {
        expect(s.branch_id).toBe(f!.branch.id);
      }
    }
  });
});
