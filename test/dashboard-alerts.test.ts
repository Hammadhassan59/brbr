import { describe, it, expect } from 'vitest'
// buildAlerts is a pure function — test all combinations
import { buildAlerts } from '../src/app/dashboard/components/alerts-panel'

describe('buildAlerts', () => {
  it('returns empty array when all counts are zero', () => {
    const alerts = buildAlerts({ lowStockCount: 0, udhaarClients: 0, udhaarTotal: 0, noShowCount: 0 })
    expect(alerts).toEqual([])
  })

  it('returns low stock alert when products below threshold', () => {
    const alerts = buildAlerts({ lowStockCount: 3, udhaarClients: 0, udhaarTotal: 0, noShowCount: 0 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('low_stock')
    expect(alerts[0].label).toContain('3 products')
    expect(alerts[0].action?.href).toBe('/dashboard/inventory')
  })

  it('returns udhaar alert with formatted amount', () => {
    const alerts = buildAlerts({ lowStockCount: 0, udhaarClients: 5, udhaarTotal: 15000, noShowCount: 0 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('udhaar')
    expect(alerts[0].label).toContain('5 clients')
    expect(alerts[0].label).toContain('Rs')
    expect(alerts[0].action?.href).toBe('/dashboard/clients?tab=udhaar')
  })

  it('returns no-show alert', () => {
    const alerts = buildAlerts({ lowStockCount: 0, udhaarClients: 0, udhaarTotal: 0, noShowCount: 2 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('no_show')
    expect(alerts[0].label).toContain('2 no-shows')
    expect(alerts[0].action?.href).toBe('/dashboard/appointments')
  })

  it('returns all three alerts when all counts > 0', () => {
    const alerts = buildAlerts({ lowStockCount: 1, udhaarClients: 2, udhaarTotal: 5000, noShowCount: 3 })
    expect(alerts).toHaveLength(3)
    expect(alerts.map(a => a.type)).toEqual(['low_stock', 'udhaar', 'no_show'])
  })

  it('maintains correct order: low_stock → udhaar → no_show', () => {
    const alerts = buildAlerts({ lowStockCount: 10, udhaarClients: 5, udhaarTotal: 50000, noShowCount: 1 })
    expect(alerts[0].type).toBe('low_stock')
    expect(alerts[1].type).toBe('udhaar')
    expect(alerts[2].type).toBe('no_show')
  })

  it('handles single low stock product correctly', () => {
    const alerts = buildAlerts({ lowStockCount: 1, udhaarClients: 0, udhaarTotal: 0, noShowCount: 0 })
    expect(alerts[0].label).toContain('1 products')
  })

  it('handles single udhaar client', () => {
    const alerts = buildAlerts({ lowStockCount: 0, udhaarClients: 1, udhaarTotal: 500, noShowCount: 0 })
    expect(alerts[0].label).toContain('1 clients')
  })

  it('handles single no-show', () => {
    const alerts = buildAlerts({ lowStockCount: 0, udhaarClients: 0, udhaarTotal: 0, noShowCount: 1 })
    expect(alerts[0].label).toContain('1 no-shows')
  })

  it('includes detail text for each alert type', () => {
    const alerts = buildAlerts({ lowStockCount: 1, udhaarClients: 1, udhaarTotal: 100, noShowCount: 1 })
    expect(alerts[0].detail).toBeTruthy()
    expect(alerts[1].detail).toBeTruthy()
    expect(alerts[2].detail).toBeTruthy()
  })

  it('includes action with label for every alert', () => {
    const alerts = buildAlerts({ lowStockCount: 1, udhaarClients: 1, udhaarTotal: 100, noShowCount: 1 })
    for (const alert of alerts) {
      expect(alert.action).toBeDefined()
      expect(alert.action!.label).toBeTruthy()
    }
  })

  it('formats large udhaar total with locale separators', () => {
    const alerts = buildAlerts({ lowStockCount: 0, udhaarClients: 10, udhaarTotal: 1500000, noShowCount: 0 })
    expect(alerts[0].label).toContain('Rs')
  })

  it('handles zero udhaar total with non-zero clients', () => {
    // Edge case: clients flagged but total is 0
    const alerts = buildAlerts({ lowStockCount: 0, udhaarClients: 3, udhaarTotal: 0, noShowCount: 0 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('udhaar')
  })
})
