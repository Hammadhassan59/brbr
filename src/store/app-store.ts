import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Branch, Staff, Salon, SalonPartner } from '@/types/database';

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
    (set) => ({
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
        }),
    }),
    { name: 'icut-session' },
  ),
);
