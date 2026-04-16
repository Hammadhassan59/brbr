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
  created_at: string;
  deactivated_at: string | null;
}

export type LeadStatus =
  | 'new' | 'contacted' | 'visited' | 'interested'
  | 'not_interested' | 'converted' | 'lost';

export interface Lead {
  id: string;
  salon_name: string;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  photo_url: string | null;
  status: LeadStatus;
  assigned_agent_id: string;
  created_by: string;
  created_by_agent: string | null;
  converted_salon_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CommissionKind = 'first_sale' | 'renewal';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'reversed';

export interface AgentCommission {
  id: string;
  agent_id: string;
  salon_id: string;
  payment_request_id: string;
  kind: CommissionKind;
  base_amount: number;
  pct: number;
  amount: number;
  status: CommissionStatus;
  payout_id: string | null;
  created_at: string;
  settled_at: string | null;
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
