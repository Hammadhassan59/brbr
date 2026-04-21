export interface SalesAgent {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  active: boolean;
  first_sale_pct: number;
  renewal_pct: number;
  code: string;
  parent_agent_id: string | null;
  agency_id: string | null;
  created_at: string;
  deactivated_at: string | null;
}

export type LeadStatus =
  | 'new' | 'contacted' | 'visited' | 'followup' | 'interested'
  | 'not_interested' | 'onboarded' | 'converted' | 'lost';

export interface Lead {
  id: string;
  salon_name: string;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  // Legacy: pre-migration-030 rows stored a full public URL here. New
  // rows leave this null and use photo_path instead.
  photo_url: string | null;
  // Storage object path in the private lead-photos bucket. Render via
  // getLeadPhotoUrl() which mints a short-lived signed URL.
  photo_path: string | null;
  status: LeadStatus;
  assigned_agent_id: string;
  created_by: string;
  created_by_agent: string | null;
  converted_salon_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CommissionKind = 'first_sale' | 'renewal' | 'bonus';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'reversed';

export interface AgentCommission {
  id: string;
  agent_id: string;
  salon_id: string | null;
  payment_request_id: string | null;
  kind: CommissionKind;
  base_amount: number;
  pct: number;
  amount: number;
  status: CommissionStatus;
  payout_id: string | null;
  bonus_tier_id: string | null;
  bonus_period_start: string | null;
  notes: string | null;
  created_at: string;
  settled_at: string | null;
}

// ───────────────────────────────────────
// Bonus tiers
// ───────────────────────────────────────
export type BonusMetric = 'onboarded_count' | 'revenue_generated';
export type BonusPeriod = 'monthly' | 'lifetime';

export interface BonusTier {
  id: string;
  agent_id: string | null; // null = global default
  metric: BonusMetric;
  period: BonusPeriod;
  threshold: number;
  bonus_amount: number;
  label: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

// ───────────────────────────────────────
// Agencies
// ───────────────────────────────────────
export type AgencyStatus = 'active' | 'frozen' | 'terminated';
export type DepositEventKind = 'collected' | 'refunded' | 'clawed';
export type RemittanceMethod = 'bank' | 'jazzcash' | 'cash';

export interface Agency {
  id: string;
  code: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  nic_number: string | null;
  address: string | null;
  /**
   * Migration 052 — territory assigned by super_admin (free-form, e.g.
   * "Lahore DHA + Johar Town", "Karachi South"). Shown on both sides so
   * the agency knows its scope and super_admin can route leads accordingly.
   */
  area: string | null;
  first_sale_pct: number;
  renewal_pct: number;
  deposit_amount: number;
  liability_threshold: number;
  terms: string | null;
  status: AgencyStatus;
  created_at: string;
  deactivated_at: string | null;
}

export type AgencyRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AgencyRequest {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  nic_number: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  status: AgencyRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_agency_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgencyAdmin {
  id: string;
  agency_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  deactivated_at: string | null;
}

export interface AgencyCommission {
  id: string;
  agency_id: string;
  salon_id: string;
  payment_request_id: string;
  kind: CommissionKind;
  base_amount: number;
  pct: number;
  amount: number;
  status: CommissionStatus;
  payout_id: string | null;
  notes: string | null;
  created_at: string;
  settled_at: string | null;
}

export interface AgencyPayout {
  id: string;
  agency_id: string;
  requested_amount: number;
  paid_amount: number | null;
  method: RemittanceMethod | null;
  reference: string | null;
  notes: string | null;
  status: PayoutStatus;
  requested_at: string;
  paid_at: string | null;
  paid_by: string | null;
}

export interface AgencyDepositEvent {
  id: string;
  agency_id: string;
  kind: DepositEventKind;
  amount: number;
  method: RemittanceMethod | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AgencyRemittance {
  id: string;
  agency_id: string;
  amount: number;
  method: RemittanceMethod;
  reference: string | null;
  notes: string | null;
  received_at: string;
  received_by: string | null;
}

export type PayoutStatus = 'requested' | 'paid' | 'rejected';
export type PayoutMethod = 'bank' | 'jazzcash' | 'cash';

export interface AgentPayout {
  id: string;
  agent_id: string;
  requested_amount: number;
  paid_amount: number | null;
  method: PayoutMethod | null;
  reference: string | null;
  notes: string | null;
  status: PayoutStatus;
  requested_at: string;
  paid_at: string | null;
  paid_by: string | null;
}
