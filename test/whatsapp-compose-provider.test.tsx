import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React from 'react'
import { WhatsAppComposeProvider, useWhatsAppCompose } from '@/components/whatsapp-compose/provider'

// ═══════════════════════════════════════
// Helper: consumer component
// ═══════════════════════════════════════

function TestConsumer() {
  const { isOpen, options, open, close } = useWhatsAppCompose()
  return (
    <div>
      <span data-testid="is-open">{String(isOpen)}</span>
      <span data-testid="recipient-name">{options?.recipient?.name ?? ''}</span>
      <span data-testid="template">{options?.template ?? ''}</span>
      <button
        onClick={() =>
          open({
            recipient: { name: 'Ayesha Khan', phone: '0300-1234567' },
            template: 'appointment_reminder',
          })
        }
      >
        Open With Options
      </button>
      <button onClick={() => open({})}>Open Empty</button>
      <button onClick={close}>Close</button>
    </div>
  )
}

// ═══════════════════════════════════════
// Tests
// ═══════════════════════════════════════

describe('WhatsAppComposeProvider', () => {
  it('starts closed with no options', () => {
    render(
      <WhatsAppComposeProvider>
        <TestConsumer />
      </WhatsAppComposeProvider>
    )

    expect(screen.getByTestId('is-open').textContent).toBe('false')
    expect(screen.getByTestId('recipient-name').textContent).toBe('')
    expect(screen.getByTestId('template').textContent).toBe('')
  })

  it('opens with recipient and template options', async () => {
    const user = userEvent.setup()
    render(
      <WhatsAppComposeProvider>
        <TestConsumer />
      </WhatsAppComposeProvider>
    )

    await user.click(screen.getByText('Open With Options'))

    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(screen.getByTestId('recipient-name').textContent).toBe('Ayesha Khan')
    expect(screen.getByTestId('template').textContent).toBe('appointment_reminder')
  })

  it('opens with empty options (no recipient or template)', async () => {
    const user = userEvent.setup()
    render(
      <WhatsAppComposeProvider>
        <TestConsumer />
      </WhatsAppComposeProvider>
    )

    await user.click(screen.getByText('Open Empty'))

    expect(screen.getByTestId('is-open').textContent).toBe('true')
    // No recipient or template provided — should be empty strings via nullish coalescing
    expect(screen.getByTestId('recipient-name').textContent).toBe('')
    expect(screen.getByTestId('template').textContent).toBe('')
  })

  it('closes and resets options to null', async () => {
    const user = userEvent.setup()
    render(
      <WhatsAppComposeProvider>
        <TestConsumer />
      </WhatsAppComposeProvider>
    )

    // Open first
    await user.click(screen.getByText('Open With Options'))
    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(screen.getByTestId('recipient-name').textContent).toBe('Ayesha Khan')

    // Now close
    await user.click(screen.getByText('Close'))
    expect(screen.getByTestId('is-open').textContent).toBe('false')
    expect(screen.getByTestId('recipient-name').textContent).toBe('')
    expect(screen.getByTestId('template').textContent).toBe('')
  })

  it('throws when useWhatsAppCompose is used outside provider', () => {
    // Suppress React's console.error for the expected thrown error
    const originalConsoleError = console.error
    console.error = () => {}

    expect(() => {
      render(<TestConsumer />)
    }).toThrow('useWhatsAppCompose must be used within WhatsAppComposeProvider')

    console.error = originalConsoleError
  })
})
