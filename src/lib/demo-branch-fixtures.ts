// Demo branch → fixture data (ISSUE-002)
//
// When a user signs in via a demo button, their Zustand state points at
// hardcoded salon/branch UUIDs defined in ./demo-data. The real Supabase DB
// has no matching rows, so every `supabase.from('staff').eq('branch_id', id)`
// used to come back empty and the appointments page rendered "No stylists
// available". These helpers let the page short-circuit on demo branches and
// render fixtures directly — same UX as real data, no DB round-trip, no 406
// errors from `.single()` branch lookups that never find the demo row.

import {
  DEMO_BRANCH,
  DEMO_STAFF_OWNER,
  DEMO_STAFF_STYLIST,
  DEMO_BRANCH_GENTS,
  DEMO_GENTS_OWNER,
  DEMO_GENTS_BARBER_SENIOR,
  DEMO_GENTS_BARBER_JUNIOR,
  DEMO_BRANCH_GENTS_2,
  DEMO_GENTS_BRANCH2_SENIOR,
  DEMO_GENTS_BRANCH2_JUNIOR,
} from './demo-data';
import type { Branch, Staff } from '@/types/database';

export interface DemoBranchFixture {
  branch: Branch;
  stylists: Staff[];
}

const DEMO_BRANCH_FIXTURES: Record<string, DemoBranchFixture> = {
  [DEMO_BRANCH.id]: {
    branch: DEMO_BRANCH,
    stylists: [],
  },
  [DEMO_BRANCH_GENTS.id]: {
    branch: DEMO_BRANCH_GENTS,
    stylists: [DEMO_GENTS_OWNER, DEMO_STAFF_OWNER, DEMO_STAFF_STYLIST, DEMO_GENTS_BARBER_SENIOR, DEMO_GENTS_BARBER_JUNIOR],
  },
  [DEMO_BRANCH_GENTS_2.id]: {
    branch: DEMO_BRANCH_GENTS_2,
    stylists: [DEMO_GENTS_BRANCH2_SENIOR, DEMO_GENTS_BRANCH2_JUNIOR],
  },
};

export function isDemoBranchId(id: string | null | undefined): boolean {
  if (!id) return false;
  return Object.prototype.hasOwnProperty.call(DEMO_BRANCH_FIXTURES, id);
}

export function getDemoBranchFixture(id: string | null | undefined): DemoBranchFixture | null {
  if (!id) return null;
  return DEMO_BRANCH_FIXTURES[id] ?? null;
}
