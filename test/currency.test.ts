import { describe, it, expect } from 'vitest'
import { formatPKR, formatPKRShort } from '../src/lib/utils/currency'

describe('formatPKR', () => {
  it('formats small amounts with Rs prefix', () => {
    expect(formatPKR(500)).toBe('Rs 500')
  })

  it('formats thousands with locale separators', () => {
    expect(formatPKR(50000)).toMatch(/Rs\s+50/)
  })

  it('handles zero', () => {
    expect(formatPKR(0)).toBe('Rs 0')
  })
})

describe('formatPKRShort', () => {
  it('returns raw number below 1000', () => {
    expect(formatPKRShort(750)).toBe('750')
  })

  it('formats thousands as K', () => {
    expect(formatPKRShort(5000)).toBe('5.0K')
  })

  it('formats lakhs as L', () => {
    expect(formatPKRShort(250000)).toBe('2.5L')
  })

  it('formats crores as Cr', () => {
    expect(formatPKRShort(10000000)).toBe('1.0Cr')
  })
})
