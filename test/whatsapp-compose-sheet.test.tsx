import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import React from 'react'

// ═══════════════════════════════════════
// Stable mock data (must not create new objects per render)
// ═══════════════════════════════════════

const MOCK_SALON = { id: 's1', name: 'Glamour Studio' }
const MOCK_BRANCH = { id: 'b1', name: 'Main Branch' }

vi.mock('@/components/providers/language-provider', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'en' as const }),
}))

vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: { salon: typeof MOCK_SALON; currentBranch: typeof MOCK_BRANCH }) => unknown) =>
    selector({ salon: MOCK_SALON, currentBranch: MOCK_BRANCH }),
}))

// The sheet now fires two .ilike() queries (name + phone) in parallel instead
// of one string-templated .or() call (ISSUE-008). Both chains terminate in
// .limit() and must be thenable so Promise.all resolves.
const MOCK_CLIENTS = [
  { id: 'c1', name: 'Ayesha Khan', phone: '0321-1234567', whatsapp: null },
  { id: 'c2', name: 'Ali Raza', phone: '0300-9876543', whatsapp: '0333-9876543' },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          // Post-branch-isolation: chain is .eq(salon_id).eq(branch_id).ilike().limit()
          eq: () => ({
            ilike: () => ({
              limit: () => Promise.resolve({ data: MOCK_CLIENTS }),
            }),
          }),
          // Legacy shape kept for any callers still using the single-eq chain.
          ilike: () => ({
            limit: () => Promise.resolve({ data: MOCK_CLIENTS }),
          }),
          or: () => ({
            limit: () => Promise.resolve({ data: MOCK_CLIENTS }),
          }),
        }),
      }),
    }),
  },
}))

// Mock Sheet to avoid base-ui portal issues in happy-dom
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  SheetTitle: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
}))

const mockWindowOpen = vi.fn()
vi.stubGlobal('open', mockWindowOpen)

import { WhatsAppComposeProvider, useWhatsAppCompose } from '@/components/whatsapp-compose/provider'
import { WhatsAppComposeSheet } from '@/components/whatsapp-compose/sheet'
import type { WhatsAppComposeOptions } from '@/components/whatsapp-compose/provider'

// ═══════════════════════════════════════
// Test harness
// ═══════════════════════════════════════

function TriggerButton({ opts }: { opts: WhatsAppComposeOptions }) {
  const { open } = useWhatsAppCompose()
  return <button onClick={() => open(opts)}>Open Sheet</button>
}

function TestApp({ opts = {} }: { opts?: WhatsAppComposeOptions }) {
  return (
    <WhatsAppComposeProvider>
      <TriggerButton opts={opts} />
      <WhatsAppComposeSheet />
    </WhatsAppComposeProvider>
  )
}

// ═══════════════════════════════════════
// Tests
// ═══════════════════════════════════════

describe('WhatsAppComposeSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is hidden by default', () => {
    render(<TestApp />)
    expect(screen.queryByText('Send WhatsApp Message')).toBeNull()
  })

  it('shows when opened', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp />)
    await user.click(screen.getByText('Open Sheet'))
    expect(screen.getByText('Send WhatsApp Message')).toBeTruthy()
  })

  it('pre-fills recipient when provided', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <TestApp opts={{ recipient: { name: 'Fatima Malik', phone: '0311-5555555' } }} />
    )
    await user.click(screen.getByText('Open Sheet'))
    expect(screen.getByText('Fatima Malik')).toBeTruthy()
    expect(screen.getByText('0311-5555555')).toBeTruthy()
  })

  it('shows search input when no recipient provided', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp opts={{}} />)
    await user.click(screen.getByText('Open Sheet'))
    expect(screen.getByPlaceholderText('Search client or enter phone...')).toBeTruthy()
  })

  it('renders all 7 template chips', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp />)
    await user.click(screen.getByText('Open Sheet'))
    expect(screen.getByText('Reminder')).toBeTruthy()
    expect(screen.getByText('Udhaar')).toBeTruthy()
    expect(screen.getByText('Receipt')).toBeTruthy()
    expect(screen.getByText('Birthday')).toBeTruthy()
    expect(screen.getByText('No-show')).toBeTruthy()
    expect(screen.getByText('Thanks')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
  })

  it('fills textarea when template chip clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp opts={{}} />)
    await user.click(screen.getByText('Open Sheet'))
    await user.click(screen.getByText('Birthday'))

    const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement
    expect(textarea.value).toContain('Happy Birthday')
  })

  it('disables send button when phone is missing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp opts={{}} />)
    await user.click(screen.getByText('Open Sheet'))

    const sendBtn = screen.getByRole('button', { name: /open in whatsapp/i })
    expect(sendBtn).toBeDisabled()
  })

  it('disables send button when message is empty', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <TestApp opts={{ recipient: { name: 'Test', phone: '0311-1234567' } }} />
    )
    await user.click(screen.getByText('Open Sheet'))

    const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement
    await user.clear(textarea)

    const sendBtn = screen.getByRole('button', { name: /open in whatsapp/i })
    expect(sendBtn).toBeDisabled()
  })

  it('calls window.open with correct wa.me URL on send', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <TestApp
        opts={{
          recipient: { name: 'Test', phone: '0321-1234567' },
          template: 'birthday',
          variables: { name: 'Test' },
        }}
      />
    )
    await user.click(screen.getByText('Open Sheet'))

    const sendBtn = screen.getByRole('button', { name: /open in whatsapp/i })
    await user.click(sendBtn)

    expect(mockWindowOpen).toHaveBeenCalledOnce()
    const [url, target] = mockWindowOpen.mock.calls[0]
    expect(url).toContain('wa.me/923211234567')
    expect(target).toBe('_blank')
  })

  it('shows character count', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <TestApp
        opts={{
          recipient: { name: 'T', phone: '0300-1111111' },
          template: 'birthday',
          variables: { name: 'T' },
        }}
      />
    )
    await user.click(screen.getByText('Open Sheet'))
    expect(screen.getByText(/characters/)).toBeTruthy()
  })

  it('shows search results when typing a name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp opts={{}} />)
    await user.click(screen.getByText('Open Sheet'))

    const input = screen.getByPlaceholderText('Search client or enter phone...')
    await user.type(input, 'Ay')

    // Advance past 300ms debounce
    await act(async () => { vi.advanceTimersByTime(400) })

    expect(screen.getByText('Ayesha Khan')).toBeTruthy()
  })

  it('uses whatsapp field when selecting client', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp opts={{}} />)
    await user.click(screen.getByText('Open Sheet'))

    const input = screen.getByPlaceholderText('Search client or enter phone...')
    await user.type(input, 'Ali')

    await act(async () => { vi.advanceTimersByTime(400) })

    await user.click(screen.getByText('Ali Raza'))
    expect(screen.getByText('0333-9876543')).toBeTruthy()
  })

  it('shows Send to option for phone-like input', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp opts={{}} />)
    await user.click(screen.getByText('Open Sheet'))

    const input = screen.getByPlaceholderText('Search client or enter phone...')
    await user.type(input, '03001234567')

    await act(async () => { vi.advanceTimersByTime(400) })

    expect(screen.getByText(/Send to 03001234567/)).toBeTruthy()
  })

  it('prompts before replacing edited message', async () => {
    const confirmSpy = vi.fn(() => false)
    window.confirm = confirmSpy
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TestApp opts={{}} />)
    await user.click(screen.getByText('Open Sheet'))

    const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement
    await user.type(textarea, 'My custom text')

    await user.click(screen.getByText('Birthday'))
    expect(confirmSpy).toHaveBeenCalledOnce()
  })
})
