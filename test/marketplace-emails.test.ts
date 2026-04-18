import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sendBookingReceivedEmail,
  sendBookingConfirmedEmail,
  sendBookingDeclinedEmail,
  sendBookingCancelledBySalonEmail,
  sendBookingCompletedReviewPromptEmail,
  sendSalonHomeBookingReviewPromptEmail,
  __internal,
} from '../src/lib/marketplace/emails';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_TO = 'customer@example.com';

const SERVICES = [
  { name: 'Haircut', displayPrice: 1200 },
  { name: 'Beard Trim', displayPrice: 600 },
];

const SLOT = new Date('2026-04-20T10:00:00.000Z');

// Each fixture produces the exact args object a production caller would pass.
const fixtures = [
  {
    label: 'sendBookingReceivedEmail',
    fn: sendBookingReceivedEmail,
    args: {
      to: BASE_TO,
      consumerName: 'Ali',
      salonName: 'Fatima Beauty Lounge',
      services: SERVICES,
      requestedSlot: SLOT,
      mode: 'in_salon' as const,
      consumerTotal: 1800,
      bookingId: 'b-123',
    },
    expectSubjectStartsWith: 'Booking request sent to',
  },
  {
    label: 'sendBookingConfirmedEmail',
    fn: sendBookingConfirmedEmail,
    args: {
      to: BASE_TO,
      consumerName: 'Ali',
      salonName: 'Fatima Beauty Lounge',
      services: SERVICES,
      slotStart: SLOT,
      mode: 'home' as const,
      address: '12 Main Blvd, DHA Phase 5',
      bookingId: 'b-123',
    },
    expectSubjectStartsWith: 'Confirmed:',
  },
  {
    label: 'sendBookingDeclinedEmail',
    fn: sendBookingDeclinedEmail,
    args: {
      to: BASE_TO,
      consumerName: 'Ali',
      salonName: 'Fatima Beauty Lounge',
      reason: 'Fully booked',
    },
    expectSubjectStartsWith: 'Booking at',
  },
  {
    label: 'sendBookingCancelledBySalonEmail',
    fn: sendBookingCancelledBySalonEmail,
    args: {
      to: BASE_TO,
      consumerName: 'Ali',
      salonName: 'Fatima Beauty Lounge',
      reason: 'Staff shortage',
    },
    expectSubjectStartsWith: 'Your booking at',
  },
  {
    label: 'sendBookingCompletedReviewPromptEmail',
    fn: sendBookingCompletedReviewPromptEmail,
    args: {
      to: BASE_TO,
      consumerName: 'Ali',
      salonName: 'Fatima Beauty Lounge',
      bookingId: 'b-123',
    },
    expectSubjectStartsWith: 'How was',
  },
  {
    label: 'sendSalonHomeBookingReviewPromptEmail',
    fn: sendSalonHomeBookingReviewPromptEmail,
    args: {
      to: 'owner@salon.example.com',
      salonOwnerName: 'Fatima',
      consumerFirstName: 'Ali',
      bookingId: 'b-123',
    },
    expectSubjectStartsWith: 'Rate your home visit',
  },
] as const;

// ---------------------------------------------------------------------------
// Env + fetch mock plumbing
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
const originalKey = process.env.RESEND_API_KEY;

function okFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 'email_123' }),
    text: async () => '{"id":"email_123"}',
  });
}

function badFetchMock(status: number, body: unknown = { message: 'Invalid to field' }) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  // Silence intentional error/warn logs from the sender.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalKey;
  }
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants
// ---------------------------------------------------------------------------

describe('marketplace email senders — envless', () => {
  it('every sender returns {ok:false} when RESEND_API_KEY is unset and does not touch the network', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    for (const fx of fixtures) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fx.fn as any)(fx.args);
      expect(result.ok, `${fx.label} should return ok:false`).toBe(false);
      expect((result as { error: string }).error).toBeTruthy();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('marketplace email senders — subject lines', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_abc';
  });

  for (const fx of fixtures) {
    it(`${fx.label} builds the expected subject and keeps it under 50 chars`, async () => {
      const fetchMock = okFetchMock();
      global.fetch = fetchMock as unknown as typeof fetch;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (fx.fn as any)(fx.args);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(__internal.RESEND_ENDPOINT);
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.from).toBe(__internal.FROM);
      expect(body.to).toBe(fx.args.to);
      expect(body.subject.startsWith(fx.expectSubjectStartsWith)).toBe(true);
      expect(body.subject.length).toBeLessThan(50);
      // html + text always supplied
      expect(typeof body.html).toBe('string');
      expect(body.html.length).toBeGreaterThan(0);
      expect(typeof body.text).toBe('string');
      expect(body.text.length).toBeGreaterThan(0);
    });
  }
});

describe('marketplace email senders — success path', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_abc';
  });

  for (const fx of fixtures) {
    it(`${fx.label} returns {ok:true} on Resend 200`, async () => {
      const fetchMock = okFetchMock();
      global.fetch = fetchMock as unknown as typeof fetch;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fx.fn as any)(fx.args);
      expect(result).toEqual({ ok: true });

      // Authorization header flows through.
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test_key_abc');
      expect(headers['Content-Type']).toBe('application/json');
    });
  }
});

describe('marketplace email senders — Resend 4xx surfaces error', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_abc';
  });

  for (const fx of fixtures) {
    it(`${fx.label} returns {ok:false, error} on Resend 422`, async () => {
      const fetchMock = badFetchMock(422, { message: 'validation_error: invalid to' });
      global.fetch = fetchMock as unknown as typeof fetch;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fx.fn as any)(fx.args);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('422');
        expect(result.error).toContain('validation_error');
      }
    });
  }

  it('surfaces a 401 auth failure with message body', async () => {
    process.env.RESEND_API_KEY = 'bad_key';
    const fetchMock = badFetchMock(401, { message: 'Invalid API key' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendBookingReceivedEmail(fixtures[0].args);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('401');
      expect(result.error).toContain('Invalid API key');
    }
  });

  it('returns {ok:false} with network error when fetch rejects', async () => {
    process.env.RESEND_API_KEY = 'test_key_abc';
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;

    const result = await sendBookingConfirmedEmail(fixtures[1].args);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('ECONNRESET');
    }
  });
});

describe('marketplace email senders — recipient guard', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_abc';
  });

  it('returns {ok:false} when recipient is empty — never calls fetch', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendBookingReceivedEmail({ ...fixtures[0].args, to: '' });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('template content sanity', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test_key_abc';
  });

  it('booking-received email includes services, total, and slot wording', async () => {
    const fetchMock = okFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendBookingReceivedEmail(fixtures[0].args);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).toContain('Haircut');
    expect(body.html).toContain('Beard Trim');
    expect(body.html).toContain('1,800'); // en-PK formatted total
    expect(body.html).toContain('waiting for them to confirm');
  });

  it('booking-confirmed email includes home address when mode is home', async () => {
    const fetchMock = okFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendBookingConfirmedEmail(fixtures[1].args);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).toContain('12 Main Blvd, DHA Phase 5');
    expect(body.html).toContain('At your home');
  });

  it('declined email escapes reason text to prevent HTML injection', async () => {
    const fetchMock = okFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendBookingDeclinedEmail({
      to: BASE_TO,
      consumerName: 'Ali',
      salonName: 'Test',
      reason: '<script>alert(1)</script>',
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).not.toContain('<script>alert(1)</script>');
    expect(body.html).toContain('&lt;script&gt;');
  });

  it('review prompt email contains a /review deep link', async () => {
    const fetchMock = okFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendBookingCompletedReviewPromptEmail(fixtures[4].args);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).toMatch(/\/account\/bookings\/b-123\/review/);
    expect(body.text).toMatch(/\/account\/bookings\/b-123\/review/);
  });

  it('salon home review email deep-links into dashboard review-consumer path', async () => {
    const fetchMock = okFetchMock();
    global.fetch = fetchMock as unknown as typeof fetch;

    await sendSalonHomeBookingReviewPromptEmail(fixtures[5].args);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.html).toMatch(/\/dashboard\/marketplace\/bookings\/b-123\/review-consumer/);
  });
});
