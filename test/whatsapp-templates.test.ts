import { describe, it, expect } from 'vitest'
import { MESSAGE_TEMPLATES, fillTemplate } from '../src/components/whatsapp-compose/templates'
import type { MessageTemplate } from '../src/components/whatsapp-compose/templates'

describe('MESSAGE_TEMPLATES', () => {
  it('exports an array of 7 templates', () => {
    expect(MESSAGE_TEMPLATES).toHaveLength(7)
  })

  it('every template has key, label, and template fields', () => {
    for (const tpl of MESSAGE_TEMPLATES) {
      expect(tpl).toHaveProperty('key')
      expect(tpl).toHaveProperty('label')
      expect(tpl).toHaveProperty('template')
    }
  })

  it('contains all expected keys', () => {
    const keys = MESSAGE_TEMPLATES.map((t) => t.key)
    expect(keys).toContain('appointment_reminder')
    expect(keys).toContain('udhaar_reminder')
    expect(keys).toContain('receipt')
    expect(keys).toContain('birthday')
    expect(keys).toContain('no_show')
    expect(keys).toContain('thank_you')
    expect(keys).toContain('custom')
  })

  it('appointment_reminder has correct template string', () => {
    const tpl = MESSAGE_TEMPLATES.find((t) => t.key === 'appointment_reminder')
    expect(tpl?.template).toBe(
      "Reminder: Your appointment is at {time}. {staff_name} is waiting for you! — {salon_name}"
    )
  })

  it('udhaar_reminder has correct template string', () => {
    const tpl = MESSAGE_TEMPLATES.find((t) => t.key === 'udhaar_reminder')
    expect(tpl?.template).toBe(
      "Dear {name}, your outstanding balance is {amount}. Please clear it on your next visit. Thank you! — {salon_name}"
    )
  })

  it('receipt template is empty string', () => {
    const tpl = MESSAGE_TEMPLATES.find((t) => t.key === 'receipt')
    expect(tpl?.template).toBe('')
  })

  it('birthday has correct template string', () => {
    const tpl = MESSAGE_TEMPLATES.find((t) => t.key === 'birthday')
    expect(tpl?.template).toBe(
      "Happy Birthday {name}! Visit {salon_name} today for a special treat. We'd love to see you!"
    )
  })

  it('no_show has correct template string', () => {
    const tpl = MESSAGE_TEMPLATES.find((t) => t.key === 'no_show')
    expect(tpl?.template).toBe(
      "Hi {name}, we missed you at your {time} appointment today. Would you like to reschedule? — {salon_name}"
    )
  })

  it('thank_you has correct template string', () => {
    const tpl = MESSAGE_TEMPLATES.find((t) => t.key === 'thank_you')
    expect(tpl?.template).toBe(
      "Thank you for visiting {salon_name}, {name}! We hope you loved your experience. See you next time!"
    )
  })

  it('custom template is empty string', () => {
    const tpl = MESSAGE_TEMPLATES.find((t) => t.key === 'custom')
    expect(tpl?.template).toBe('')
  })

  it('labels are non-empty strings', () => {
    for (const tpl of MESSAGE_TEMPLATES) {
      expect(typeof tpl.label).toBe('string')
      expect(tpl.label.length).toBeGreaterThan(0)
    }
  })
})

describe('fillTemplate', () => {
  it('fills appointment_reminder variables', () => {
    const result = fillTemplate('appointment_reminder', {
      time: '3:00 PM',
      staff_name: 'Amna',
      salon_name: 'iCut',
    })
    expect(result).toBe('Reminder: Your appointment is at 3:00 PM. Amna is waiting for you! — iCut')
  })

  it('fills udhaar_reminder variables', () => {
    const result = fillTemplate('udhaar_reminder', {
      name: 'Bilal',
      amount: 'Rs. 500',
      salon_name: 'iCut',
    })
    expect(result).toBe(
      'Dear Bilal, your outstanding balance is Rs. 500. Please clear it on your next visit. Thank you! — iCut'
    )
  })

  it('receipt returns receipt_text variable', () => {
    const result = fillTemplate('receipt', { receipt_text: 'Total: Rs. 1200' })
    expect(result).toBe('Total: Rs. 1200')
  })

  it('receipt returns empty string when receipt_text is absent', () => {
    const result = fillTemplate('receipt', {})
    expect(result).toBe('')
  })

  it('birthday fills variables', () => {
    const result = fillTemplate('birthday', { name: 'Sara', salon_name: 'iCut' })
    expect(result).toBe(
      "Happy Birthday Sara! Visit iCut today for a special treat. We'd love to see you!"
    )
  })

  it('no_show fills variables', () => {
    const result = fillTemplate('no_show', {
      name: 'Hassan',
      time: '11:00 AM',
      salon_name: 'iCut',
    })
    expect(result).toBe(
      'Hi Hassan, we missed you at your 11:00 AM appointment today. Would you like to reschedule? — iCut'
    )
  })

  it('thank_you fills variables', () => {
    const result = fillTemplate('thank_you', { salon_name: 'iCut', name: 'Zara' })
    expect(result).toBe(
      'Thank you for visiting iCut, Zara! We hope you loved your experience. See you next time!'
    )
  })

  it('custom returns empty string regardless of variables', () => {
    const result = fillTemplate('custom', { anything: 'ignored' })
    expect(result).toBe('')
  })

  it('leaves unmatched placeholders as-is', () => {
    const result = fillTemplate('appointment_reminder', {
      time: '2 PM',
      // staff_name and salon_name intentionally omitted
    })
    expect(result).toContain('{staff_name}')
    expect(result).toContain('{salon_name}')
    expect(result).toContain('2 PM')
  })

  it('unknown key returns empty string', () => {
    // @ts-expect-error testing runtime behaviour with invalid key
    const result = fillTemplate('nonexistent_key', { name: 'Test' })
    expect(result).toBe('')
  })
})
