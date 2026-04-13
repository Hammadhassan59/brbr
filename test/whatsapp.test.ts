import { describe, it, expect } from 'vitest'
import { generateWhatsAppLink, encodeMessage } from '../src/lib/utils/whatsapp'

describe('generateWhatsAppLink', () => {
  it('converts 03XX format to international', () => {
    const link = generateWhatsAppLink('0321-1234567', 'Hello')
    expect(link).toBe('https://wa.me/923211234567?text=Hello')
  })

  it('handles phone without dash', () => {
    const link = generateWhatsAppLink('03211234567', 'Hi')
    expect(link).toBe('https://wa.me/923211234567?text=Hi')
  })

  it('handles +92 prefix', () => {
    const link = generateWhatsAppLink('+923211234567', 'Hi')
    expect(link).toBe('https://wa.me/923211234567?text=Hi')
  })

  it('handles phone with spaces', () => {
    const link = generateWhatsAppLink('0321 1234567', 'Hi')
    expect(link).toBe('https://wa.me/923211234567?text=Hi')
  })

  it('encodes special characters in message', () => {
    const link = generateWhatsAppLink('03211234567', 'Hello & welcome!')
    expect(link).toContain('text=Hello%20%26%20welcome!')
  })

  it('encodes Urdu text', () => {
    const link = generateWhatsAppLink('03211234567', 'آپ کی اپائنٹمنٹ')
    expect(link).toContain('text=')
    expect(link).toContain('wa.me/923211234567')
  })

  it('handles already international number without +', () => {
    const link = generateWhatsAppLink('923211234567', 'Hi')
    expect(link).toBe('https://wa.me/923211234567?text=Hi')
  })
})

describe('encodeMessage', () => {
  it('replaces single variable', () => {
    const result = encodeMessage('Hello {name}!', { name: 'Fatima' })
    expect(result).toBe('Hello Fatima!')
  })

  it('replaces multiple variables', () => {
    const result = encodeMessage('{name} at {time}', { name: 'Sadia', time: '2 PM' })
    expect(result).toBe('Sadia at 2 PM')
  })

  it('replaces all occurrences of same variable', () => {
    const result = encodeMessage('{name} is {name}', { name: 'Ahmed' })
    expect(result).toBe('Ahmed is Ahmed')
  })

  it('leaves unmatched placeholders', () => {
    const result = encodeMessage('Hello {name}, your {missing}', { name: 'Ali' })
    expect(result).toBe('Hello Ali, your {missing}')
  })

  it('handles empty variables object', () => {
    const result = encodeMessage('No vars here', {})
    expect(result).toBe('No vars here')
  })

  it('handles empty template', () => {
    const result = encodeMessage('', { name: 'Test' })
    expect(result).toBe('')
  })
})
