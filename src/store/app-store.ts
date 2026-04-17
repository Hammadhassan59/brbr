import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Branch, Staff, Salon, SalonPartner } from '@/types/database';

/**
 * Shape returned by getDashboardBootstrap that we hydrate from. Kept loose
 * so callers can pass either the full server-action return or a subset of
 * it — the store only reads the fields it understands.
 */
export interface BootstrapPayload {
  permissions?: Record<string, boolean>;
  branchIds?: string[];
  memberBranches?: Array<{ id: string; name: string }>;
  mainBranch?: { id: string; name?: string } | null;
  primaryBranchId?: string | null;
}

interface AppState {
  salon: Salon | null;
  branches: Branch[];
  currentBranch: Branch | null;
  currentStaff: Staff | null;
  currentPartner: SalonPartner | null;
  isOwner: boolean;
  isPartner: boolean;
  isSuperAdmin: boolean;
  isSalesAgent: boolean;
  agentId: string | null;
  showPaywall: boolean;
  // Multi-branch / permissions state (migration 036). Populated from
  // getDashboardBootstrap on dashboard mount. Permissions is the server-
  // resolved map (role preset shallow-merged with staff override); UI gates
  // read permissions[key] ?? false. branchIds is the list of branches this
  // session can switch into via switchBranch(). memberBranches is the
  // {id, name} pairs for UI rendering (branch pickers) and mirrors branchIds
  // minus salon-level branches the user can't see.
  permissions: Record<string, boolean>;
  branchIds: string[];
  memberBranches: Array<{ id: string; name: string }>;
  setPermissions: (v: Record<string, boolean>) => void;
  setBranchIds: (v: string[]) => void;
  setMemberBranches: (v: Array<{ id: string; name: string }>) => void;
  /**
   * One-shot hydration from the server bootstrap. Writes permissions,
   * branchIds, memberBranches and — if the persisted currentBranch is not in
   * branchIds — snaps currentBranch back to the session's primaryBranch (or
   * the first member branch). Prevents stale localStorage from giving
   * someone access to a branch they just lost via staff_branches edits.
   */
  hydrateFromBootstrap: (boot: BootstrapPayload) => void;
  setSalon: (salon: Salon | null) => void;
  setBranches: (branches: Branch[]) => void;
  setCurrentBranch: (branch: Branch | null) => void;
  setCurrentStaff: (staff: Staff | null) => void;
  setCurrentPartner: (partner: SalonPartner | null) => void;
  setIsOwner: (v: boolean) => void;
  setIsPartner: (v: boolean) => void;
  setIsSuperAdmin: (v: boolean) => void;
  setIsSalesAgent: (v: boolean) => void;
  setAgentId: (id: string | null) => void;
  setShowPaywall: (v: boolean) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      salon: null,
      branches: [],
      currentBranch: null,
      currentStaff: null,
      currentPartner: null,
      isOwner: false,
      isPartner: false,
      isSuperAdmin: false,
      isSalesAgent: false,
      agentId: null,
      showPaywall: false,
      permissions: {},
      branchIds: [],
      memberBranches: [],
      setSalon: (salon) => set({ salon }),
      setBranches: (branches) => set({ branches }),
      setCurrentBranch: (branch) => set({ currentBranch: branch }),
      setCurrentStaff: (staff) => set({ currentStaff: staff }),
      setCurrentPartner: (partner) => set({ currentPartner: partner }),
      setIsOwner: (v) => set({ isOwner: v }),
      setIsPartner: (v) => set({ isPartner: v }),
      setIsSuperAdmin: (v) => set({ isSuperAdmin: v }),
      setIsSalesAgent: (v) => set({ isSalesAgent: v }),
      setAgentId: (id) => set({ agentId: id }),
      setShowPaywall: (v) => set({ showPaywall: v }),
      setPermissions: (v) => set({ permissions: v }),
      setBranchIds: (v) => set({ branchIds: v }),
      setMemberBranches: (v) => set({ memberBranches: v }),
      hydrateFromBootstrap: (boot) => {
        const nextPerms = boot.permissions ?? get().permissions;
        const nextBranchIds = boot.branchIds ?? get().branchIds;
        const nextMembers = boot.memberBranches ?? get().memberBranches;

        // Validate currentBranch against the authoritative branchIds. If the
        // persisted currentBranch is no longer a member branch (staff moved
        // branches, branch deleted, etc.), fall back to primaryBranch → first
        // member branch → null. This is the safety net that makes localStorage
        // stale-data non-dangerous.
        const current = get().currentBranch;
        let nextCurrent = current;
        if (nextBranchIds.length > 0 && current && !nextBranchIds.includes(current.id)) {
          const primaryId = boot.primaryBranchId ?? boot.mainBranch?.id ?? null;
          const fallback =
            (primaryId ? nextMembers.find((b) => b.id === primaryId) : undefined) ??
            nextMembers[0] ??
            null;
          // We only have {id, name} from the bootstrap; if the existing
          // `branches` list has the full Branch row, prefer that so downstream
          // consumers see every column. Otherwise fall back to the stub.
          if (fallback) {
            const full = get().branches.find((b) => b.id === fallback.id);
            nextCurrent = (full ?? (fallback as unknown as Branch)) || null;
          } else {
            nextCurrent = null;
          }
        }

        set({
          permissions: nextPerms,
          branchIds: nextBranchIds,
          memberBranches: nextMembers,
          currentBranch: nextCurrent,
        });
      },
      reset: () =>
        set({
          salon: null,
          branches: [],
          currentBranch: null,
          currentStaff: null,
          currentPartner: null,
          isOwner: false,
          isPartner: false,
          isSuperAdmin: false,
          isSalesAgent: false,
          agentId: null,
          showPaywall: false,
          permissions: {},
          branchIds: [],
          memberBranches: [],
        }),
    }),
    { name: 'icut-session' },
  ),
);
