import { describe, it, expect } from 'vitest'
import { getRoleAccess } from '../src/lib/role-access'

describe('getRoleAccess', () => {
  it('gives owner full access', () => {
    expect(getRoleAccess('owner')).toBe('full')
  })

  it('gives manager full access', () => {
    expect(getRoleAccess('manager')).toBe('full')
  })

  it('gives receptionist front_desk access', () => {
    expect(getRoleAccess('receptionist')).toBe('front_desk')
  })

  it('gives senior_stylist stylist access', () => {
    expect(getRoleAccess('senior_stylist')).toBe('stylist')
  })

  it('gives junior_stylist stylist access', () => {
    expect(getRoleAccess('junior_stylist')).toBe('stylist')
  })

  it('gives helper minimal access', () => {
    expect(getRoleAccess('helper')).toBe('minimal')
  })

  it('defaults unknown roles to minimal', () => {
    expect(getRoleAccess('intern')).toBe('minimal')
  })
})
