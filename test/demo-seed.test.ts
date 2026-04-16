import { describe, it, expect } from 'vitest';
import { getDemoSeed } from '../src/lib/demo-agent-seed';

describe('getDemoSeed', () => {
  const agentId = '11111111-2222-3333-4444-555555555555';

  it('produces deterministic IDs across runs (so cron resets stay stable)', () => {
    const a = getDemoSeed(agentId);
    const b = getDemoSeed(agentId);
    expect(a.salons.map((s) => s.id)).toEqual(b.salons.map((s) => s.id));
    expect(a.leads.map((l) => l.id)).toEqual(b.leads.map((l) => l.id));
    expect(a.commissions.map((c) => c.id)).toEqual(b.commissions.map((c) => c.id));
  });

  it('produces different IDs per agent so two demos can coexist without collisions', () => {
    const a = getDemoSeed(agentId);
    const b = getDemoSeed('99999999-8888-7777-6666-555555555555');
    expect(a.salons[0].id).not.toBe(b.salons[0].id);
    expect(a.leads[0].id).not.toBe(b.leads[0].id);
  });

  it('seeds 8 leads — one per visible status tab', () => {
    const seed = getDemoSeed(agentId);
    expect(seed.leads).toHaveLength(8);
    const statuses = seed.leads.map((l) => l.status as string).sort();
    expect(statuses).toEqual(
      ['contacted', 'followup', 'interested', 'lost', 'new', 'not_interested', 'onboarded', 'visited'].sort(),
    );
  });

  it('all seeded salons are attributed to the demo agent (so the cron knows what to clean up)', () => {
    const seed = getDemoSeed(agentId);
    for (const salon of seed.salons) {
      expect(salon.sold_by_agent_id).toBe(agentId);
    }
  });

  it('every payment_request is source=agent_collected and approved (drives the cash ledger)', () => {
    const seed = getDemoSeed(agentId);
    for (const pr of seed.paymentRequests) {
      expect(pr.source).toBe('agent_collected');
      expect(pr.status).toBe('approved');
    }
  });

  it('commissions reference the seeded payment_requests by id', () => {
    const seed = getDemoSeed(agentId);
    const prIds = new Set(seed.paymentRequests.map((p) => p.id));
    for (const c of seed.commissions) {
      expect(prIds.has(c.payment_request_id as string)).toBe(true);
    }
  });
});
