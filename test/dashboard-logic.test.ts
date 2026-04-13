import { describe, it, expect } from 'vitest'
import type { DailySummary, AppointmentWithDetails, Staff } from '../src/types/database'

// ═══════════════════════════════════════
// Dashboard business logic tests
// These replicate the inline logic from dashboard/page.tsx
// to ensure correctness of calculations
// ═══════════════════════════════════════

// --- Helper: replicate daysAgoStr from dashboard ---
function daysAgoStr(todayPKT: string, n: number): string {
  const d = new Date(todayPKT)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// --- Helper: replicate navigateDate logic ---
function navigateDate(selectedDate: string, todayPKT: string, delta: number): string | null {
  const d = new Date(selectedDate)
  d.setDate(d.getDate() + delta)
  const newDate = d.toISOString().slice(0, 10)
  if (newDate > todayPKT) return null // blocked
  return newDate
}

// --- Helper: replicate getMonthStr ---
function getMonthStr(todayPKT: string, monthsAgo: number): string {
  const d = new Date(todayPKT)
  d.setMonth(d.getMonth() - monthsAgo, 1)
  return d.toISOString().slice(0, 10)
}

// --- Helper: replicate computedEndDate ---
function computedEndDate(
  activeFilter: string,
  todayPKT: string,
  selectedDate: string,
  rangeTo?: Date
): string {
  if (rangeTo) return rangeTo.toISOString().slice(0, 10)
  if (activeFilter === '7d') return todayPKT
  if (activeFilter === '30d') return todayPKT
  if (activeFilter.startsWith('mon-')) {
    const monthsAgo = Number(activeFilter.split('-')[1])
    const d = new Date(todayPKT)
    d.setMonth(d.getMonth() - monthsAgo)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`
    return end > todayPKT ? todayPKT : end
  }
  return selectedDate
}

// --- Helper: replicate commission calc ---
function calcCommission(sp: { revenue: number; services_done: number }, staffRecord: Staff | undefined): number {
  if (staffRecord) {
    if (staffRecord.commission_type === 'percentage') {
      return sp.revenue * (staffRecord.commission_rate / 100)
    } else if (staffRecord.commission_type === 'flat') {
      return sp.services_done * staffRecord.commission_rate
    }
  }
  return sp.revenue * 0.25 // fallback
}

// --- Helper: replicate hourMap generation ---
function buildHourMap(billsData: { total_amount: number; created_at: string }[]): { label: string; revenue: number; appointments: number }[] {
  const hourMap: Record<string, { revenue: number; appointments: number }> = {}
  for (let h = 9; h <= 21; h++) {
    const label = h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
    hourMap[label] = { revenue: 0, appointments: 0 }
  }

  billsData.forEach((bill) => {
    const hour = new Date(bill.created_at).getHours()
    const label = hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`
    if (hourMap[label]) {
      hourMap[label].revenue += bill.total_amount
      hourMap[label].appointments += 1
    }
  })

  return Object.entries(hourMap).map(([label, data]) => ({ label, ...data }))
}

// --- Helper: replicate cash drawer calc ---
function calcCashInDrawer(drawerData: { opening_balance: number | null; total_cash_sales: number | null; total_expenses: number | null }): number {
  return (drawerData.opening_balance || 0) + (drawerData.total_cash_sales || 0) - (drawerData.total_expenses || 0)
}

// --- Helper: replicate low stock filtering ---
function countLowStock(products: { current_stock: number; low_stock_threshold: number }[]): number {
  return products.filter(p => p.current_stock <= p.low_stock_threshold).length
}

// --- Helper: replicate udhaar aggregation ---
function aggregateUdhaar(clients: { udhaar_balance: number }[]): { clients: number; total: number } {
  return {
    clients: clients.length,
    total: clients.reduce((sum, c) => sum + c.udhaar_balance, 0),
  }
}

// ═══════════════════════════════════════
// Test suites
// ═══════════════════════════════════════

describe('daysAgoStr', () => {
  it('returns today for n=0', () => {
    expect(daysAgoStr('2026-04-10', 0)).toBe('2026-04-10')
  })

  it('returns yesterday for n=1', () => {
    expect(daysAgoStr('2026-04-10', 1)).toBe('2026-04-09')
  })

  it('returns 6 days ago for 7d filter', () => {
    expect(daysAgoStr('2026-04-10', 6)).toBe('2026-04-04')
  })

  it('returns 29 days ago for 30d filter', () => {
    expect(daysAgoStr('2026-04-10', 29)).toBe('2026-03-12')
  })

  it('handles month boundary', () => {
    expect(daysAgoStr('2026-04-01', 1)).toBe('2026-03-31')
  })

  it('handles year boundary', () => {
    expect(daysAgoStr('2026-01-01', 1)).toBe('2025-12-31')
  })
})

describe('navigateDate', () => {
  const today = '2026-04-10'

  it('goes back one day', () => {
    expect(navigateDate('2026-04-10', today, -1)).toBe('2026-04-09')
  })

  it('goes forward one day when not at today', () => {
    expect(navigateDate('2026-04-09', today, 1)).toBe('2026-04-10')
  })

  it('blocks navigation beyond today', () => {
    expect(navigateDate('2026-04-10', today, 1)).toBeNull()
  })

  it('allows navigation to today exactly', () => {
    expect(navigateDate('2026-04-09', today, 1)).toBe('2026-04-10')
  })

  it('handles going back across months', () => {
    expect(navigateDate('2026-04-01', today, -1)).toBe('2026-03-31')
  })
})

describe('getMonthStr', () => {
  it('returns first of current month for monthsAgo=0', () => {
    const result = getMonthStr('2026-04-10', 0)
    expect(result).toBe('2026-04-01')
  })

  it('returns first of previous month', () => {
    const result = getMonthStr('2026-04-10', 1)
    expect(result).toBe('2026-03-01')
  })

  it('returns first of 2 months ago', () => {
    const result = getMonthStr('2026-04-10', 2)
    expect(result).toBe('2026-02-01')
  })

  it('handles year boundary', () => {
    const result = getMonthStr('2026-01-15', 1)
    expect(result).toBe('2025-12-01')
  })
})

describe('computedEndDate', () => {
  const today = '2026-04-10'

  it('returns rangeTo date when provided', () => {
    const rangeTo = new Date('2026-04-05')
    expect(computedEndDate('custom', today, '2026-04-01', rangeTo)).toBe('2026-04-05')
  })

  it('returns today for 7d filter', () => {
    expect(computedEndDate('7d', today, '2026-04-04')).toBe('2026-04-10')
  })

  it('returns today for 30d filter', () => {
    expect(computedEndDate('30d', today, '2026-03-12')).toBe('2026-04-10')
  })

  it('returns last day of current month for mon-0', () => {
    const result = computedEndDate('mon-0', today, '2026-04-01')
    // April has 30 days, but since Apr 30 > Apr 10 (todayPKT), returns today
    expect(result).toBe('2026-04-10')
  })

  it('returns last day of previous month for mon-1', () => {
    const result = computedEndDate('mon-1', today, '2026-03-01')
    // March has 31 days
    expect(result).toBe('2026-03-31')
  })

  it('returns last day of 2 months ago for mon-2', () => {
    const result = computedEndDate('mon-2', today, '2026-02-01')
    // Feb 2026 has 28 days
    expect(result).toBe('2026-02-28')
  })

  it('returns selectedDate for today filter', () => {
    expect(computedEndDate('today', today, '2026-04-10')).toBe('2026-04-10')
  })

  it('returns selectedDate for custom without rangeTo', () => {
    expect(computedEndDate('custom', today, '2026-04-05')).toBe('2026-04-05')
  })
})

describe('commission calculation', () => {
  it('calculates percentage commission', () => {
    const staff: Staff = {
      id: '1', salon_id: 's', branch_id: 'b', name: 'A', phone: null,
      email: null, auth_user_id: null,
      role: 'senior_stylist', photo_url: null, pin_code: '1234',
      base_salary: 20000, commission_type: 'percentage', commission_rate: 30,
      join_date: '2025-01-01', is_active: true, last_login_at: null, first_login_seen: false, created_at: '2025-01-01',
    }
    expect(calcCommission({ revenue: 10000, services_done: 5 }, staff)).toBe(3000)
  })

  it('calculates flat commission per service', () => {
    const staff: Staff = {
      id: '1', salon_id: 's', branch_id: 'b', name: 'B', phone: null,
      email: null, auth_user_id: null,
      role: 'junior_stylist', photo_url: null, pin_code: '1234',
      base_salary: 12000, commission_type: 'flat', commission_rate: 50,
      join_date: '2025-01-01', is_active: true, last_login_at: null, first_login_seen: false, created_at: '2025-01-01',
    }
    expect(calcCommission({ revenue: 10000, services_done: 8 }, staff)).toBe(400)
  })

  it('uses 25% fallback when staff record not found', () => {
    expect(calcCommission({ revenue: 10000, services_done: 5 }, undefined)).toBe(2500)
  })

  it('handles zero revenue with percentage commission', () => {
    const staff: Staff = {
      id: '1', salon_id: 's', branch_id: 'b', name: 'C', phone: null,
      email: null, auth_user_id: null,
      role: 'senior_stylist', photo_url: null, pin_code: '1234',
      base_salary: 20000, commission_type: 'percentage', commission_rate: 30,
      join_date: '2025-01-01', is_active: true, last_login_at: null, first_login_seen: false, created_at: '2025-01-01',
    }
    expect(calcCommission({ revenue: 0, services_done: 0 }, staff)).toBe(0)
  })

  it('handles zero commission rate', () => {
    const staff: Staff = {
      id: '1', salon_id: 's', branch_id: 'b', name: 'D', phone: null,
      email: null, auth_user_id: null,
      role: 'receptionist', photo_url: null, pin_code: '1234',
      base_salary: 15000, commission_type: 'percentage', commission_rate: 0,
      join_date: '2025-01-01', is_active: true, last_login_at: null, first_login_seen: false, created_at: '2025-01-01',
    }
    expect(calcCommission({ revenue: 50000, services_done: 20 }, staff)).toBe(0)
  })
})

describe('appointment filtering', () => {
  const makeAppointment = (overrides: Partial<AppointmentWithDetails>): AppointmentWithDetails => ({
    id: Math.random().toString(),
    branch_id: 'b1',
    salon_id: 's1',
    client_id: null,
    staff_id: null,
    status: 'booked',
    appointment_date: '2026-04-10',
    start_time: '10:00',
    end_time: '10:30',
    token_number: null,
    is_walkin: false,
    notes: null,
    reminder_sent: false,
    created_at: '2026-04-10T00:00:00Z',
    ...overrides,
  })

  it('counts done appointments', () => {
    const appointments = [
      makeAppointment({ status: 'done' }),
      makeAppointment({ status: 'done' }),
      makeAppointment({ status: 'booked' }),
      makeAppointment({ status: 'in_progress' }),
    ]
    const done = appointments.filter(a => a.status === 'done').length
    expect(done).toBe(2)
  })

  it('counts walk-ins', () => {
    const appointments = [
      makeAppointment({ is_walkin: true }),
      makeAppointment({ is_walkin: false }),
      makeAppointment({ is_walkin: true }),
    ]
    const walkIns = appointments.filter(a => a.is_walkin).length
    expect(walkIns).toBe(2)
  })

  it('counts no-shows', () => {
    const appointments = [
      makeAppointment({ status: 'no_show' }),
      makeAppointment({ status: 'done' }),
      makeAppointment({ status: 'cancelled' }),
      makeAppointment({ status: 'no_show' }),
    ]
    const noShows = appointments.filter(a => a.status === 'no_show').length
    expect(noShows).toBe(2)
  })

  it('handles empty appointments array', () => {
    const appointments: AppointmentWithDetails[] = []
    expect(appointments.filter(a => a.status === 'done').length).toBe(0)
    expect(appointments.filter(a => a.is_walkin).length).toBe(0)
    expect(appointments.filter(a => a.status === 'no_show').length).toBe(0)
  })

  it('filters stylist appointments by staff_id', () => {
    const appointments = [
      makeAppointment({ staff_id: 'staff-1' }),
      makeAppointment({ staff_id: 'staff-2' }),
      makeAppointment({ staff_id: 'staff-1' }),
    ]
    const myAppointments = appointments.filter(a => a.staff_id === 'staff-1')
    expect(myAppointments).toHaveLength(2)
  })
})

describe('hourMap generation', () => {
  it('creates 13 hourly slots (9AM-9PM)', () => {
    const result = buildHourMap([])
    expect(result).toHaveLength(13)
    expect(result[0].label).toBe('9AM')
    expect(result[result.length - 1].label).toBe('9PM')
  })

  it('buckets bill into correct hour', () => {
    const bills = [
      { total_amount: 1000, created_at: '2026-04-10T10:30:00' },
    ]
    const result = buildHourMap(bills)
    const tenAM = result.find(r => r.label === '10AM')
    expect(tenAM?.revenue).toBe(1000)
    expect(tenAM?.appointments).toBe(1)
  })

  it('aggregates multiple bills in same hour', () => {
    const bills = [
      { total_amount: 1000, created_at: '2026-04-10T14:15:00' },
      { total_amount: 2500, created_at: '2026-04-10T14:45:00' },
    ]
    const result = buildHourMap(bills)
    const twoPM = result.find(r => r.label === '2PM')
    expect(twoPM?.revenue).toBe(3500)
    expect(twoPM?.appointments).toBe(2)
  })

  it('ignores bills outside 9AM-9PM range', () => {
    const bills = [
      { total_amount: 500, created_at: '2026-04-10T07:00:00' }, // 7AM - outside range
      { total_amount: 500, created_at: '2026-04-10T23:00:00' }, // 11PM - outside range
    ]
    const result = buildHourMap(bills)
    const totalRevenue = result.reduce((sum, r) => sum + r.revenue, 0)
    expect(totalRevenue).toBe(0)
  })

  it('handles noon correctly', () => {
    const bills = [
      { total_amount: 3000, created_at: '2026-04-10T12:30:00' },
    ]
    const result = buildHourMap(bills)
    const noon = result.find(r => r.label === '12PM')
    expect(noon?.revenue).toBe(3000)
  })

  it('leaves all slots at zero with no bills', () => {
    const result = buildHourMap([])
    for (const slot of result) {
      expect(slot.revenue).toBe(0)
      expect(slot.appointments).toBe(0)
    }
  })
})

describe('cash drawer calculation', () => {
  it('computes opening + sales - expenses', () => {
    expect(calcCashInDrawer({ opening_balance: 5000, total_cash_sales: 15000, total_expenses: 3000 })).toBe(17000)
  })

  it('handles null values as zero', () => {
    expect(calcCashInDrawer({ opening_balance: null, total_cash_sales: null, total_expenses: null })).toBe(0)
  })

  it('handles mixed null and values', () => {
    expect(calcCashInDrawer({ opening_balance: 5000, total_cash_sales: null, total_expenses: 2000 })).toBe(3000)
  })

  it('handles zero opening balance', () => {
    expect(calcCashInDrawer({ opening_balance: 0, total_cash_sales: 10000, total_expenses: 0 })).toBe(10000)
  })

  it('can result in negative (overdraw)', () => {
    expect(calcCashInDrawer({ opening_balance: 1000, total_cash_sales: 0, total_expenses: 5000 })).toBe(-4000)
  })
})

describe('low stock counting', () => {
  it('counts products at or below threshold', () => {
    const products = [
      { current_stock: 5, low_stock_threshold: 10 },  // low
      { current_stock: 10, low_stock_threshold: 10 },  // at threshold = low
      { current_stock: 15, low_stock_threshold: 10 },  // ok
    ]
    expect(countLowStock(products)).toBe(2)
  })

  it('returns 0 for empty array', () => {
    expect(countLowStock([])).toBe(0)
  })

  it('counts all when all are low', () => {
    const products = [
      { current_stock: 0, low_stock_threshold: 5 },
      { current_stock: 1, low_stock_threshold: 5 },
    ]
    expect(countLowStock(products)).toBe(2)
  })

  it('counts none when all are above threshold', () => {
    const products = [
      { current_stock: 100, low_stock_threshold: 10 },
      { current_stock: 50, low_stock_threshold: 10 },
    ]
    expect(countLowStock(products)).toBe(0)
  })

  it('handles zero stock and zero threshold', () => {
    const products = [{ current_stock: 0, low_stock_threshold: 0 }]
    expect(countLowStock(products)).toBe(1) // 0 <= 0
  })
})

describe('udhaar aggregation', () => {
  it('counts clients and sums balances', () => {
    const clients = [
      { udhaar_balance: 1000 },
      { udhaar_balance: 2500 },
      { udhaar_balance: 500 },
    ]
    const result = aggregateUdhaar(clients)
    expect(result.clients).toBe(3)
    expect(result.total).toBe(4000)
  })

  it('handles empty array', () => {
    const result = aggregateUdhaar([])
    expect(result.clients).toBe(0)
    expect(result.total).toBe(0)
  })

  it('handles single client', () => {
    const result = aggregateUdhaar([{ udhaar_balance: 5000 }])
    expect(result.clients).toBe(1)
    expect(result.total).toBe(5000)
  })
})

describe('isStylist detection', () => {
  it('identifies senior_stylist', () => {
    const isStylist = (role: string) => role === 'senior_stylist' || role === 'junior_stylist'
    expect(isStylist('senior_stylist')).toBe(true)
  })

  it('identifies junior_stylist', () => {
    const isStylist = (role: string) => role === 'senior_stylist' || role === 'junior_stylist'
    expect(isStylist('junior_stylist')).toBe(true)
  })

  it('rejects owner', () => {
    const isStylist = (role: string) => role === 'senior_stylist' || role === 'junior_stylist'
    expect(isStylist('owner')).toBe(false)
  })

  it('rejects manager', () => {
    const isStylist = (role: string) => role === 'senior_stylist' || role === 'junior_stylist'
    expect(isStylist('manager')).toBe(false)
  })

  it('rejects receptionist', () => {
    const isStylist = (role: string) => role === 'senior_stylist' || role === 'junior_stylist'
    expect(isStylist('receptionist')).toBe(false)
  })

  it('rejects helper', () => {
    const isStylist = (role: string) => role === 'senior_stylist' || role === 'junior_stylist'
    expect(isStylist('helper')).toBe(false)
  })
})

describe('multi-day isMultiDay detection', () => {
  it('is multi-day when 7d filter active', () => {
    const isMultiDay = (selectedDate: string, endDate: string, activeFilter: string) =>
      selectedDate !== endDate || activeFilter === '7d' || activeFilter === '30d' || activeFilter.startsWith('mon-')
    expect(isMultiDay('2026-04-04', '2026-04-10', '7d')).toBe(true)
  })

  it('is multi-day when 30d filter active', () => {
    const isMultiDay = (selectedDate: string, endDate: string, activeFilter: string) =>
      selectedDate !== endDate || activeFilter === '7d' || activeFilter === '30d' || activeFilter.startsWith('mon-')
    expect(isMultiDay('2026-03-12', '2026-04-10', '30d')).toBe(true)
  })

  it('is multi-day when month filter active', () => {
    const isMultiDay = (selectedDate: string, endDate: string, activeFilter: string) =>
      selectedDate !== endDate || activeFilter === '7d' || activeFilter === '30d' || activeFilter.startsWith('mon-')
    expect(isMultiDay('2026-03-01', '2026-03-31', 'mon-1')).toBe(true)
  })

  it('is single-day for today filter', () => {
    const isMultiDay = (selectedDate: string, endDate: string, activeFilter: string) =>
      selectedDate !== endDate || activeFilter === '7d' || activeFilter === '30d' || activeFilter.startsWith('mon-')
    expect(isMultiDay('2026-04-10', '2026-04-10', 'today')).toBe(false)
  })

  it('is multi-day when custom range has different start/end', () => {
    const isMultiDay = (selectedDate: string, endDate: string, activeFilter: string) =>
      selectedDate !== endDate || activeFilter === '7d' || activeFilter === '30d' || activeFilter.startsWith('mon-')
    expect(isMultiDay('2026-04-01', '2026-04-05', 'custom')).toBe(true)
  })
})

describe('handleDayClick range selection', () => {
  it('sets rangeFrom on first click', () => {
    let rangeFrom: Date | undefined = undefined
    let rangeTo: Date | undefined = undefined
    const day = new Date('2026-04-01')

    // Replicate logic
    if (!rangeFrom || (rangeFrom && rangeTo)) {
      rangeFrom = day
      rangeTo = undefined
    }

    expect(rangeFrom).toEqual(day)
    expect(rangeTo).toBeUndefined()
  })

  it('sets rangeTo on second click (later date)', () => {
    let rangeFrom: Date | undefined = new Date('2026-04-01')
    let rangeTo: Date | undefined = undefined
    const day = new Date('2026-04-05')

    if (!rangeFrom || (rangeFrom && rangeTo)) {
      rangeFrom = day
      rangeTo = undefined
    } else {
      const from = day < rangeFrom ? day : rangeFrom
      const to = day < rangeFrom ? rangeFrom : day
      rangeFrom = from
      rangeTo = to
    }

    expect(rangeFrom).toEqual(new Date('2026-04-01'))
    expect(rangeTo).toEqual(new Date('2026-04-05'))
  })

  it('swaps from/to when second click is before first', () => {
    let rangeFrom: Date | undefined = new Date('2026-04-10')
    let rangeTo: Date | undefined = undefined
    const day = new Date('2026-04-01')

    if (!rangeFrom || (rangeFrom && rangeTo)) {
      rangeFrom = day
      rangeTo = undefined
    } else {
      const from = day < rangeFrom ? day : rangeFrom
      const to = day < rangeFrom ? rangeFrom : day
      rangeFrom = from
      rangeTo = to
    }

    expect(rangeFrom).toEqual(new Date('2026-04-01'))
    expect(rangeTo).toEqual(new Date('2026-04-10'))
  })

  it('resets on third click (both from and to already set)', () => {
    let rangeFrom: Date | undefined = new Date('2026-04-01')
    let rangeTo: Date | undefined = new Date('2026-04-05')
    const day = new Date('2026-04-15')

    if (!rangeFrom || (rangeFrom && rangeTo)) {
      rangeFrom = day
      rangeTo = undefined
    }

    expect(rangeFrom).toEqual(new Date('2026-04-15'))
    expect(rangeTo).toBeUndefined()
  })
})
