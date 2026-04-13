import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatPKDate, formatTime, formatDateTime, getTodayPKT, getCurrentTimePKT, getPrayerBlocks } from '../src/lib/utils/dates'

describe('formatPKDate', () => {
  it('formats ISO date string', () => {
    expect(formatPKDate('2026-04-10')).toBe('10 Apr 2026')
  })

  it('formats Date object', () => {
    expect(formatPKDate(new Date(2026, 0, 1))).toBe('1 Jan 2026')
  })

  it('formats date with double-digit day', () => {
    expect(formatPKDate('2026-12-25')).toBe('25 Dec 2026')
  })

  it('handles leap year date', () => {
    expect(formatPKDate('2028-02-29')).toBe('29 Feb 2028')
  })
})

describe('formatTime', () => {
  it('formats morning time', () => {
    expect(formatTime('09:30')).toBe('9:30 AM')
  })

  it('formats noon', () => {
    expect(formatTime('12:00')).toBe('12:00 PM')
  })

  it('formats afternoon time', () => {
    expect(formatTime('14:30')).toBe('2:30 PM')
  })

  it('formats midnight', () => {
    expect(formatTime('00:00')).toBe('12:00 AM')
  })

  it('formats 1 AM', () => {
    expect(formatTime('01:05')).toBe('1:05 AM')
  })

  it('formats 11 PM', () => {
    expect(formatTime('23:45')).toBe('11:45 PM')
  })

  it('pads single-digit minutes', () => {
    expect(formatTime('09:05')).toBe('9:05 AM')
  })
})

describe('formatDateTime', () => {
  it('formats ISO datetime string', () => {
    const result = formatDateTime('2026-04-10T14:30:00')
    expect(result).toBe('10 Apr 2026, 2:30 PM')
  })

  it('formats Date object', () => {
    const result = formatDateTime(new Date(2026, 3, 10, 9, 0))
    expect(result).toBe('10 Apr 2026, 9:00 AM')
  })
})

describe('getTodayPKT', () => {
  it('returns a valid YYYY-MM-DD string', () => {
    const result = getTodayPKT()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a date that parses correctly', () => {
    const result = getTodayPKT()
    const parsed = new Date(result)
    expect(parsed.toString()).not.toBe('Invalid Date')
  })
})

describe('getCurrentTimePKT', () => {
  it('returns a formatted time string', () => {
    const result = getCurrentTimePKT()
    // Should match patterns like "9:30 AM" or "12:45 PM"
    expect(result).toMatch(/\d{1,2}:\d{2}\s[AP]M/)
  })
})

describe('getPrayerBlocks', () => {
  it('returns 5 prayer blocks', () => {
    const blocks = getPrayerBlocks()
    expect(blocks).toHaveLength(5)
  })

  it('includes all five prayers', () => {
    const blocks = getPrayerBlocks()
    const names = blocks.map(b => b.name)
    expect(names).toEqual(['Fajr', 'Zuhr', 'Asr', 'Maghrib', 'Isha'])
  })

  it('each block has start and end times', () => {
    const blocks = getPrayerBlocks()
    for (const block of blocks) {
      expect(block.start).toMatch(/^\d{2}:\d{2}$/)
      expect(block.end).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('end time is after start time for each block', () => {
    const blocks = getPrayerBlocks()
    for (const block of blocks) {
      expect(block.end > block.start).toBe(true)
    }
  })
})
