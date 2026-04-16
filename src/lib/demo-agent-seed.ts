/**
 * Canonical seed data for a demo sales-agent identity. Returned arrays are
 * shaped for direct INSERT into the corresponding tables. IDs are deterministic
 * per demo agent (so cron resets always produce the same row IDs and FK chains
 * remain stable across cycles).
 *
 * If you change this file, the next reset cron tick (every 10 min) is what
 * propagates the new seed to live demo accounts. To force-apply now, hit
 * /api/cron/reset-demo with the cron secret.
 */

import { createHash } from 'crypto';

/** UUIDv5-style deterministic ID derived from agentId + tag. */
function did(agentId: string, tag: string): string {
  const h = createHash('sha1').update(`${agentId}:${tag}`).digest('hex');
  // RFC 4122 variant + version bits for v5
  return [
    h.substring(0, 8),
    h.substring(8, 12),
    '5' + h.substring(13, 16),
    ((parseInt(h.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + h.substring(18, 20),
    h.substring(20, 32),
  ].join('-');
}

export interface DemoSeed {
  leads: Array<Record<string, unknown>>;
  salons: Array<Record<string, unknown>>;
  paymentRequests: Array<Record<string, unknown>>;
  commissions: Array<Record<string, unknown>>;
  payouts: Array<Record<string, unknown>>;
}

export function getDemoSeed(demoAgentId: string): DemoSeed {
  // 3 demo salons (one per plan), all active and attributed to the demo agent.
  const salons = [
    {
      id: did(demoAgentId, 'salon-1'),
      name: 'Demo Salon — Basic',
      slug: `demo-basic-${demoAgentId.slice(0, 8)}`,
      type: 'gents',
      city: 'Lahore',
      address: 'Demo Street, Gulberg',
      phone: '03001112233',
      whatsapp: '03001112233',
      sold_by_agent_id: demoAgentId,
      subscription_plan: 'basic',
      subscription_status: 'active',
      subscription_started_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      subscription_expires_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      setup_complete: true,
      owner_id: did(demoAgentId, 'salon-1-owner'),
    },
    {
      id: did(demoAgentId, 'salon-2'),
      name: 'Demo Salon — Growth',
      slug: `demo-growth-${demoAgentId.slice(0, 8)}`,
      type: 'unisex',
      city: 'Karachi',
      address: 'Demo Avenue, DHA',
      phone: '03002223344',
      whatsapp: '03002223344',
      sold_by_agent_id: demoAgentId,
      subscription_plan: 'growth',
      subscription_status: 'active',
      subscription_started_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      subscription_expires_at: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
      setup_complete: true,
      owner_id: did(demoAgentId, 'salon-2-owner'),
    },
    {
      id: did(demoAgentId, 'salon-3'),
      name: 'Demo Salon — Pro',
      slug: `demo-pro-${demoAgentId.slice(0, 8)}`,
      type: 'ladies',
      city: 'Islamabad',
      address: 'Demo Plaza, F-7',
      phone: '03003334455',
      whatsapp: '03003334455',
      sold_by_agent_id: demoAgentId,
      subscription_plan: 'pro',
      subscription_status: 'active',
      subscription_started_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      subscription_expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      setup_complete: true,
      owner_id: did(demoAgentId, 'salon-3-owner'),
    },
  ];

  // 4 approved agent_collected payments — drives the cash ledger
  const paymentRequests = [
    {
      id: did(demoAgentId, 'pr-1'),
      salon_id: salons[0].id,
      plan: 'basic',
      amount: 2500,
      reference: 'DEMO-TXN-001',
      method: null,
      source: 'agent_collected',
      status: 'approved',
      duration_days: 30,
      reviewed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: did(demoAgentId, 'pr-2'),
      salon_id: salons[0].id,
      plan: 'basic',
      amount: 2500,
      reference: 'DEMO-TXN-002',
      method: null,
      source: 'agent_collected',
      status: 'approved',
      duration_days: 30,
      reviewed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: did(demoAgentId, 'pr-3'),
      salon_id: salons[1].id,
      plan: 'growth',
      amount: 5000,
      reference: 'DEMO-TXN-003',
      method: null,
      source: 'agent_collected',
      status: 'approved',
      duration_days: 30,
      reviewed_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: did(demoAgentId, 'pr-4'),
      salon_id: salons[2].id,
      plan: 'pro',
      amount: 9000,
      reference: 'DEMO-TXN-004',
      method: null,
      source: 'agent_collected',
      status: 'approved',
      duration_days: 30,
      reviewed_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // 5 commissions: 3 first_sale + 2 renewal; mix of approved and paid
  const commissions = [
    { id: did(demoAgentId, 'c-1'), agent_id: demoAgentId, salon_id: salons[0].id, payment_request_id: paymentRequests[0].id, kind: 'first_sale', base_amount: 2500, pct: 20, amount: 500,  status: 'paid'     },
    { id: did(demoAgentId, 'c-2'), agent_id: demoAgentId, salon_id: salons[0].id, payment_request_id: paymentRequests[1].id, kind: 'renewal',    base_amount: 2500, pct: 5,  amount: 125,  status: 'approved' },
    { id: did(demoAgentId, 'c-3'), agent_id: demoAgentId, salon_id: salons[1].id, payment_request_id: paymentRequests[2].id, kind: 'first_sale', base_amount: 5000, pct: 20, amount: 1000, status: 'paid'     },
    { id: did(demoAgentId, 'c-4'), agent_id: demoAgentId, salon_id: salons[2].id, payment_request_id: paymentRequests[3].id, kind: 'first_sale', base_amount: 9000, pct: 20, amount: 1800, status: 'paid'     },
    { id: did(demoAgentId, 'c-5'), agent_id: demoAgentId, salon_id: salons[2].id, payment_request_id: paymentRequests[3].id, kind: 'renewal',    base_amount: 9000, pct: 5,  amount: 450,  status: 'approved' },
  ];

  const payouts = [
    {
      id: did(demoAgentId, 'po-1'),
      agent_id: demoAgentId,
      requested_amount: 3300,
      paid_amount: 3300,
      method: 'bank',
      reference: 'DEMO-PAYOUT-001',
      notes: 'Demo monthly payout',
      status: 'paid',
      paid_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // 8 leads, one per relevant status
  const leadStatuses = ['new', 'contacted', 'visited', 'followup', 'interested', 'not_interested', 'lost', 'onboarded'] as const;
  const sampleNames = [
    'Crown Cuts', 'Royal Salon', 'Lahore Style', 'Style Hub',
    'Glamour House', 'Quick Cut', 'Elite Salon', 'Premier Beauty',
  ];
  const leads = leadStatuses.map((status, i) => ({
    id: did(demoAgentId, `lead-${i}`),
    salon_name: `Demo: ${sampleNames[i]}`,
    owner_name: `Demo Owner ${i + 1}`,
    phone: `030011122${String(i).padStart(2, '0')}`,
    city: ['Lahore', 'Karachi', 'Islamabad', 'Faisalabad'][i % 4],
    address: 'Demo address line ' + (i + 1),
    notes: 'Demo lead — created by reset cron',
    status,
    assigned_agent_id: demoAgentId,
    created_by: demoAgentId, // demo agent's id; harmless since demo can't escape sandbox
    created_by_agent: demoAgentId,
  }));

  return { leads, salons, paymentRequests, commissions, payouts };
}
