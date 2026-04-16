import { describe, it, expect } from 'vitest';
import { getDemoSalonSeed } from '../src/lib/demo-salon-seed';
import {
  DEMO_SALON_ID, DEMO_BRANCH_ID,
  DEMO_STAFF_IDS, DEMO_SERVICE_IDS, DEMO_PRODUCT_IDS, DEMO_CLIENT_IDS,
} from '../src/lib/demo-salon-constants';

// Shape validation for the cron reset payload. Dates are relative to `now()`
// so we can't assert exact timestamps — instead we check cardinality, FK
// integrity (every inserted child points at a seeded parent), and that the
// ID pattern is deterministic within a single call (two inserts of the same
// seed must match tag-for-tag).

describe('getDemoSalonSeed', () => {
  it('produces deterministic row IDs within a call (so cron is idempotent)', () => {
    const a = getDemoSalonSeed();
    const b = getDemoSalonSeed();
    expect(a.appointments.map((x) => x.id)).toEqual(b.appointments.map((x) => x.id));
    expect(a.bills.map((x) => x.id)).toEqual(b.bills.map((x) => x.id));
    expect(a.billItems.map((x) => x.id)).toEqual(b.billItems.map((x) => x.id));
  });

  it('seeds 30 appointments across yesterday/today/tomorrow', () => {
    const seed = getDemoSalonSeed();
    expect(seed.appointments.length).toBe(30);
    expect(seed.appointmentServices.length).toBe(30);
  });

  it('every appointment is scoped to the demo salon + demo branch', () => {
    const seed = getDemoSalonSeed();
    for (const apt of seed.appointments) {
      expect(apt.salon_id).toBe(DEMO_SALON_ID);
      expect(apt.branch_id).toBe(DEMO_BRANCH_ID);
    }
  });

  it('seeds 20 paid bills with 1-3 items each', () => {
    const seed = getDemoSalonSeed();
    expect(seed.bills.length).toBe(20);
    expect(seed.billItems.length).toBeGreaterThanOrEqual(20);
    expect(seed.billItems.length).toBeLessThanOrEqual(60);
    for (const bill of seed.bills) {
      expect(bill.status).toBe('paid');
      expect(bill.salon_id).toBe(DEMO_SALON_ID);
    }
  });

  it('every bill_item points at a seeded bill', () => {
    const seed = getDemoSalonSeed();
    const billIds = new Set(seed.bills.map((b) => b.id));
    for (const item of seed.billItems) {
      expect(billIds.has(item.bill_id as string)).toBe(true);
    }
  });

  it('cash drawer is open today with Rs 5,000 opening balance', () => {
    const seed = getDemoSalonSeed();
    expect(seed.cashDrawers.length).toBe(1);
    expect(seed.cashDrawers[0].opening_balance).toBe(5000);
    expect(seed.cashDrawers[0].status).toBe('open');
    expect(seed.cashDrawers[0].branch_id).toBe(DEMO_BRANCH_ID);
  });

  it('today attendance has mostly present + 1 late + 1 leave', () => {
    const seed = getDemoSalonSeed();
    const statuses = seed.attendance.map((a) => a.status as string).sort();
    expect(seed.attendance.length).toBe(7);
    expect(statuses).toContain('late');
    expect(statuses).toContain('leave');
    expect(statuses.filter((s) => s === 'present').length).toBeGreaterThanOrEqual(4);
  });

  it('expenses include the three required categories', () => {
    const seed = getDemoSalonSeed();
    const cats = seed.expenses.map((e) => e.category as string);
    expect(cats).toEqual(expect.arrayContaining(['Utility Bills', 'Staff Meals', 'Cleaning Supplies']));
  });

  it('attendance/advance/stock rows reference seeded staff + product IDs', () => {
    const seed = getDemoSalonSeed();
    const validStaff = new Set(Object.values(DEMO_STAFF_IDS));
    const validProducts = new Set(Object.values(DEMO_PRODUCT_IDS));

    for (const a of seed.attendance) expect(validStaff.has(a.staff_id as string)).toBe(true);
    for (const adv of seed.advances) expect(validStaff.has(adv.staff_id as string)).toBe(true);
    for (const sm of seed.stockMovements) expect(validProducts.has(sm.product_id as string)).toBe(true);
  });

  it('appointments reference seeded service and client IDs', () => {
    const seed = getDemoSalonSeed();
    const validServices = new Set(Object.values(DEMO_SERVICE_IDS));
    const validClients = new Set(DEMO_CLIENT_IDS);

    for (const sv of seed.appointmentServices) {
      expect(validServices.has(sv.service_id as string)).toBe(true);
    }
    for (const apt of seed.appointments) {
      expect(validClients.has(apt.client_id as string)).toBe(true);
    }
  });
});
