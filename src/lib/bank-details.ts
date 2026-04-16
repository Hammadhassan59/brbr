export const BANK_DETAILS = {
  bankName: 'Meezan Bank',
  accountTitle: 'iCut Technologies',
  accountNumber: '02340105566723',
  jazzcash: '03001234567',
  supportWhatsapp: '923001234567',
} as const;

export interface PlanOption {
  key: 'basic' | 'growth' | 'pro';
  name: string;
  price: number;
  branches: number;
  staff: number;
  features: string[];
}

export const DEFAULT_PLANS: PlanOption[] = [
  { key: 'basic', name: 'Basic', price: 2500, branches: 1, staff: 3, features: ['1 branch', 'Up to 3 staff', 'All features'] },
  { key: 'growth', name: 'Growth', price: 5000, branches: 1, staff: 0, features: ['1 branch', 'Unlimited staff', 'All features'] },
  { key: 'pro', name: 'Pro', price: 9000, branches: 3, staff: 0, features: ['Up to 3 branches', 'Unlimited staff', 'Priority support'] },
];
