import { describe, it, expect } from 'vitest'
import { isValidPKPhone } from '../src/lib/utils/phone'

describe('isValidPKPhone', () => {
  it('returns true for empty string (phone is optional)', () => {
    expect(isValidPKPhone('')).toBe(true)
  })

  it('validates standard 03XX-XXXXXXX format', () => {
    expect(isValidPKPhone('0300-1234567')).toBe(true)
  })

  it('validates without dash', () => {
    expect(isValidPKPhone('03001234567')).toBe(true)
  })

  it('rejects numbers not starting with 03-09', () => {
    expect(isValidPKPhone('02001234567')).toBe(false)
  })

  it('rejects too-short numbers', () => {
    expect(isValidPKPhone('0300-12345')).toBe(false)
  })

  it('accepts with spaces', () => {
    expect(isValidPKPhone('0300 1234567')).toBe(true)
  })
})
