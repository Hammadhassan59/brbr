/**
 * Operational-data generator for the shared demo salon. Returned arrays are
 * shaped for direct INSERT into the matching tables. IDs are deterministic
 * per-seed-run (salted with the tag so repeated resets stay stable across
 * ticks).
 *
 * Bootstrap (salons/branches/staff/services/products/clients) is handled by
 * migration 032_demo_salon.sql. This module is only responsible for the
 * *volatile* rows that the cron wipes and re-inserts every 10 minutes:
 * appointments, bills, cash drawer, attendance, expenses, udhaar payments,
 * advances, stock movements.
 *
 * Timestamps are relative to `now()` / `new Date()` so the dashboard always
 * shows "today's" data regardless of when the cron last ran.
 */
import { createHash } from 'crypto';
import {
  DEMO_SALON_ID, DEMO_BRANCH_ID,
  DEMO_STAFF_IDS, DEMO_SERVICE_IDS, DEMO_PRODUCT_IDS, DEMO_CLIENT_IDS,
} from './demo-salon-constants';

/** UUIDv5-style deterministic ID from an arbitrary tag. */
function did(tag: string): string {
  const h = createHash('sha1').update(`demo-salon-seed:${tag}`).digest('hex');
  return [
    h.substring(0, 8),
    h.substring(8, 12),
    '5' + h.substring(13, 16),
    ((parseInt(h.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + h.substring(18, 20),
    h.substring(20, 32),
  ].join('-');
}

/** Pakistan Standard Time day boundary helpers, just for the `date` column. */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function atTime(dateStr: string, time: string): string {
  // Return ISO for created_at. Time is HH:MM local-ish; we just embed the
  // current UTC offset-naive representation for consistency.
  return new Date(`${dateStr}T${time}:00.000Z`).toISOString();
}

export interface DemoSalonSeed {
  appointments: Array<Record<string, unknown>>;
  appointmentServices: Array<Record<string, unknown>>;
  bills: Array<Record<string, unknown>>;
  billItems: Array<Record<string, unknown>>;
  tips: Array<Record<string, unknown>>;
  cashDrawers: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  udhaarPayments: Array<Record<string, unknown>>;
  advances: Array<Record<string, unknown>>;
  stockMovements: Array<Record<string, unknown>>;
}

// Service price table — kept in sync with migration 032 inserts.
const SERVICE_PRICES: Record<string, { name: string; price: number; duration: number }> = {
  [DEMO_SERVICE_IDS.haircut]:    { name: 'Haircut',        price: 800,  duration: 30 },
  [DEMO_SERVICE_IDS.beardTrim]:  { name: 'Beard Trim',     price: 400,  duration: 20 },
  [DEMO_SERVICE_IDS.hairColor]:  { name: 'Hair Color',     price: 3500, duration: 90 },
  [DEMO_SERVICE_IDS.facial]:     { name: 'Facial',         price: 1800, duration: 45 },
  [DEMO_SERVICE_IDS.manicure]:   { name: 'Manicure',       price: 900,  duration: 30 },
  [DEMO_SERVICE_IDS.pedicure]:   { name: 'Pedicure',       price: 1200, duration: 40 },
  [DEMO_SERVICE_IDS.spa]:        { name: 'Hair Spa',       price: 2500, duration: 60 },
  [DEMO_SERVICE_IDS.kidsCut]:    { name: 'Kids Haircut',   price: 500,  duration: 25 },
  [DEMO_SERVICE_IDS.shave]:      { name: 'Shave',          price: 350,  duration: 20 },
  [DEMO_SERVICE_IDS.hairWash]:   { name: 'Hair Wash',      price: 300,  duration: 15 },
};

const ALL_STAFF = [
  DEMO_STAFF_IDS.owner,
  DEMO_STAFF_IDS.manager,
  DEMO_STAFF_IDS.seniorA,
  DEMO_STAFF_IDS.seniorB,
  DEMO_STAFF_IDS.junior,
  DEMO_STAFF_IDS.receptionist,
  DEMO_STAFF_IDS.helper,
];

const STYLIST_STAFF = [
  DEMO_STAFF_IDS.owner,
  DEMO_STAFF_IDS.manager,
  DEMO_STAFF_IDS.seniorA,
  DEMO_STAFF_IDS.seniorB,
  DEMO_STAFF_IDS.junior,
];

const SERVICE_IDS = Object.keys(SERVICE_PRICES);

/**
 * Build the volatile demo-salon dataset for a single cron tick. Everything
 * is scoped to DEMO_SALON_ID / DEMO_BRANCH_ID so the caller can just INSERT.
 */
export function getDemoSalonSeed(): DemoSalonSeed {
  const today = todayDate();
  const nowIso = new Date().toISOString();

  // ───────────────────────────────────────
  // APPOINTMENTS — 30 rows across yesterday/today/tomorrow
  // ───────────────────────────────────────
  const appointments: Array<Record<string, unknown>> = [];
  const appointmentServices: Array<Record<string, unknown>> = [];

  const aptPlan: Array<{
    dayOffset: number;
    time: string;
    status: 'done' | 'booked' | 'no_show' | 'in_progress';
    isWalkin: boolean;
    serviceIdx: number;
    staffIdx: number;
    clientIdx: number;
  }> = [];

  // Yesterday — 10 all done
  for (let i = 0; i < 10; i++) {
    aptPlan.push({
      dayOffset: -1,
      time: `${String(10 + Math.floor(i * 0.8)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      status: i === 7 ? 'no_show' : 'done',
      isWalkin: i % 3 === 0,
      serviceIdx: i % SERVICE_IDS.length,
      staffIdx: i % STYLIST_STAFF.length,
      clientIdx: i,
    });
  }
  // Today — 12, mix of in_progress, booked, done
  for (let i = 0; i < 12; i++) {
    const hour = 10 + i;
    aptPlan.push({
      dayOffset: 0,
      time: `${String(hour % 24).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      status: i < 4 ? 'done' : i === 4 ? 'in_progress' : 'booked',
      isWalkin: i % 4 === 0,
      serviceIdx: (i + 3) % SERVICE_IDS.length,
      staffIdx: (i + 2) % STYLIST_STAFF.length,
      clientIdx: 10 + i,
    });
  }
  // Tomorrow — 8 booked
  for (let i = 0; i < 8; i++) {
    aptPlan.push({
      dayOffset: 1,
      time: `${String(10 + i).padStart(2, '0')}:00`,
      status: 'booked',
      isWalkin: false,
      serviceIdx: (i + 5) % SERVICE_IDS.length,
      staffIdx: (i + 1) % STYLIST_STAFF.length,
      clientIdx: 22 + i,
    });
  }

  aptPlan.forEach((p, idx) => {
    const aptId = did(`apt:${idx}`);
    const date = daysAgo(-p.dayOffset); // dayOffset -1 → daysAgo(1) = yesterday
    // Recompute for positive offsets
    const aptDate = p.dayOffset < 0 ? daysAgo(-p.dayOffset) : p.dayOffset > 0 ? daysFromNow(p.dayOffset) : today;
    const serviceId = SERVICE_IDS[p.serviceIdx];
    const svc = SERVICE_PRICES[serviceId];
    const staffId = STYLIST_STAFF[p.staffIdx];
    const clientId = DEMO_CLIENT_IDS[p.clientIdx % DEMO_CLIENT_IDS.length];

    // Compute end_time from service duration so the appointments_no_overlap
    // GIST EXCLUDE constraint doesn't treat every NULL-ended row as a
    // full-day block that collides with every other appointment for the
    // same stylist.
    const [hh, mm] = p.time.split(':').map(Number);
    const endMinutes = hh * 60 + mm + (svc.duration || 30);
    const endH = Math.min(23, Math.floor(endMinutes / 60));
    const endM = endMinutes % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    appointments.push({
      id: aptId,
      branch_id: DEMO_BRANCH_ID,
      salon_id: DEMO_SALON_ID,
      client_id: clientId,
      staff_id: staffId,
      status: p.status,
      appointment_date: aptDate,
      start_time: p.time,
      end_time: endTime,
      token_number: idx + 1,
      is_walkin: p.isWalkin,
      notes: null,
      reminder_sent: false,
      created_at: atTime(date, p.time),
    });
    appointmentServices.push({
      id: did(`apt-svc:${idx}`),
      appointment_id: aptId,
      service_id: serviceId,
      service_name: svc.name,
      price: svc.price,
      duration_minutes: svc.duration,
    });
  });

  // ───────────────────────────────────────
  // BILLS — 20 paid bills from last 3 days, 1-3 items each
  // ───────────────────────────────────────
  const bills: Array<Record<string, unknown>> = [];
  const billItems: Array<Record<string, unknown>> = [];
  const tips: Array<Record<string, unknown>> = [];
  const paymentMethods: Array<'cash' | 'jazzcash' | 'card' | 'bank_transfer'> = [
    'cash', 'cash', 'cash', 'jazzcash', 'jazzcash', 'card', 'bank_transfer',
  ];

  for (let i = 0; i < 20; i++) {
    const billId = did(`bill:${i}`);
    const dayOffset = i < 7 ? 2 : i < 14 ? 1 : 0;
    const billDate = daysAgo(dayOffset);
    const hour = 10 + (i % 10);
    const billCreatedAt = atTime(billDate, `${String(hour).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

    const numItems = 1 + (i % 3);
    let subtotal = 0;
    const chosenServiceIds: string[] = [];
    for (let j = 0; j < numItems; j++) {
      const svcId = SERVICE_IDS[(i + j) % SERVICE_IDS.length];
      chosenServiceIds.push(svcId);
      const svc = SERVICE_PRICES[svcId];
      subtotal += svc.price;
      billItems.push({
        id: did(`bill-item:${i}:${j}`),
        bill_id: billId,
        item_type: 'service',
        service_id: svcId,
        product_id: null,
        name: svc.name,
        quantity: 1,
        unit_price: svc.price,
        total_price: svc.price,
      });
    }

    const method = paymentMethods[i % paymentMethods.length];
    const tipAmount = i % 5 === 0 ? 200 : 0;
    const total = subtotal + tipAmount;
    const staffId = STYLIST_STAFF[i % STYLIST_STAFF.length];
    const clientId = DEMO_CLIENT_IDS[i % DEMO_CLIENT_IDS.length];

    bills.push({
      id: billId,
      bill_number: `BB-${billDate.replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`,
      branch_id: DEMO_BRANCH_ID,
      salon_id: DEMO_SALON_ID,
      appointment_id: null,
      client_id: clientId,
      staff_id: staffId,
      subtotal,
      discount_amount: 0,
      discount_type: null,
      tax_amount: 0,
      tip_amount: tipAmount,
      total_amount: total,
      paid_amount: total,
      payment_method: method,
      payment_details: null,
      udhaar_added: 0,
      loyalty_points_used: 0,
      loyalty_points_earned: Math.floor(subtotal / 100),
      promo_code: null,
      status: 'paid',
      notes: null,
      receipt_sent: false,
      created_at: billCreatedAt,
    });

    if (tipAmount > 0) {
      tips.push({
        id: did(`tip:${i}`),
        staff_id: staffId,
        bill_id: billId,
        amount: tipAmount,
        date: billDate,
      });
    }
  }

  // ───────────────────────────────────────
  // CASH DRAWER — today only, opening Rs 5,000
  // ───────────────────────────────────────
  // Running cash total across today's bills (~Rs 15k per spec; computed from
  // the cash bills above for realism).
  const todayCashTotal = bills
    .filter((b) => b.created_at && typeof b.created_at === 'string' && (b.created_at as string).startsWith(today) && b.payment_method === 'cash')
    .reduce((s, b) => s + Number((b as { total_amount: number }).total_amount || 0), 0);

  const cashDrawers: Array<Record<string, unknown>> = [
    {
      id: did('cash-drawer:today'),
      branch_id: DEMO_BRANCH_ID,
      date: today,
      opening_balance: 5000,
      closing_balance: null,
      total_cash_sales: todayCashTotal,
      total_expenses: 0,
      opened_by: DEMO_STAFF_IDS.manager,
      closed_by: null,
      status: 'open',
      notes: 'Demo opening',
      created_at: atTime(today, '09:00'),
    },
  ];

  // ───────────────────────────────────────
  // ATTENDANCE — today: most present, 1 leave, 1 late
  // ───────────────────────────────────────
  const attendance: Array<Record<string, unknown>> = ALL_STAFF.map((staffId, idx) => {
    const status: 'present' | 'late' | 'leave' =
      idx === 0 ? 'late' : idx === ALL_STAFF.length - 1 ? 'leave' : 'present';
    return {
      id: did(`attendance:${idx}`),
      staff_id: staffId,
      branch_id: DEMO_BRANCH_ID,
      date: today,
      status,
      check_in: status === 'leave' ? null : status === 'late' ? '10:25' : '09:45',
      check_out: null,
      late_minutes: status === 'late' ? 25 : 0,
      deduction_amount: status === 'late' ? 100 : 0,
      notes: status === 'leave' ? 'Approved leave' : null,
    };
  });

  // ───────────────────────────────────────
  // EXPENSES — 3 today
  // ───────────────────────────────────────
  const expenses: Array<Record<string, unknown>> = [
    {
      id: did('expense:utility'),
      branch_id: DEMO_BRANCH_ID,
      category: 'Utility Bills',
      amount: 4500,
      description: 'K-Electric bill (demo)',
      date: today,
      created_by: DEMO_STAFF_IDS.manager,
      created_at: atTime(today, '11:30'),
    },
    {
      id: did('expense:meals'),
      branch_id: DEMO_BRANCH_ID,
      category: 'Staff Meals',
      amount: 800,
      description: 'Lunch for 4 staff',
      date: today,
      created_by: DEMO_STAFF_IDS.manager,
      created_at: atTime(today, '13:00'),
    },
    {
      id: did('expense:cleaning'),
      branch_id: DEMO_BRANCH_ID,
      category: 'Cleaning Supplies',
      amount: 1200,
      description: 'Floor cleaner + tissues',
      date: today,
      created_by: DEMO_STAFF_IDS.manager,
      created_at: atTime(today, '14:15'),
    },
  ];

  // ───────────────────────────────────────
  // UDHAAR PAYMENTS — 2 partial settlements
  // ───────────────────────────────────────
  const udhaarPayments: Array<Record<string, unknown>> = [
    {
      id: did('udhaar:1'),
      client_id: DEMO_CLIENT_IDS[2], // client with udhaar balance (seeded in migration)
      amount: 500,
      payment_method: 'cash',
      notes: 'Partial settlement',
      recorded_by: DEMO_STAFF_IDS.receptionist,
      created_at: atTime(daysAgo(1), '17:00'),
    },
    {
      id: did('udhaar:2'),
      client_id: DEMO_CLIENT_IDS[5],
      amount: 1000,
      payment_method: 'jazzcash',
      notes: null,
      recorded_by: DEMO_STAFF_IDS.manager,
      created_at: atTime(today, '16:30'),
    },
  ];

  // ───────────────────────────────────────
  // ADVANCES — 2 staff advances
  // ───────────────────────────────────────
  const advances: Array<Record<string, unknown>> = [
    {
      id: did('advance:1'),
      staff_id: DEMO_STAFF_IDS.junior,
      amount: 5000,
      date: daysAgo(5),
      reason: 'Medical',
      is_deducted: false,
      approved_by: DEMO_STAFF_IDS.owner,
      created_at: atTime(daysAgo(5), '10:00'),
    },
    {
      id: did('advance:2'),
      staff_id: DEMO_STAFF_IDS.seniorA,
      amount: 3000,
      date: daysAgo(2),
      reason: 'Personal',
      is_deducted: false,
      approved_by: DEMO_STAFF_IDS.owner,
      created_at: atTime(daysAgo(2), '12:00'),
    },
  ];

  // ───────────────────────────────────────
  // STOCK MOVEMENTS — 2 recent backbar uses
  // ───────────────────────────────────────
  const stockMovements: Array<Record<string, unknown>> = [
    {
      id: did('stock:1'),
      product_id: DEMO_PRODUCT_IDS.shampoo,
      branch_id: DEMO_BRANCH_ID,
      movement_type: 'backbar_use',
      quantity: -1,
      reference_id: null,
      notes: 'Used during wash',
      created_by: DEMO_STAFF_IDS.seniorA,
      created_at: atTime(today, '11:00'),
    },
    {
      id: did('stock:2'),
      product_id: DEMO_PRODUCT_IDS.wax,
      branch_id: DEMO_BRANCH_ID,
      movement_type: 'purchase',
      quantity: 10,
      reference_id: null,
      notes: 'Monthly stock top-up',
      created_by: DEMO_STAFF_IDS.owner,
      created_at: atTime(daysAgo(1), '15:00'),
    },
  ];

  // Silence unused for lint — kept because seed may expand.
  void nowIso;

  return {
    appointments,
    appointmentServices,
    bills,
    billItems,
    tips,
    cashDrawers,
    attendance,
    expenses,
    udhaarPayments,
    advances,
    stockMovements,
  };
}
