'use client';

/**
 * Home-first mode toggle.
 *
 * Two big pill buttons: 🏡 At salon / 🚗 At home. The server renders the
 * current selection (read from the `icut-mode` cookie in the parent server
 * component) so the UI is correct on first paint — no flicker between a
 * default and the persisted choice.
 *
 * Clicking a pill fires the `setMarketplaceMode` server action to persist
 * the cookie, then calls `router.refresh()` so the downstream data (featured
 * salons, city picker, etc.) re-renders under the new filter without a
 * hard navigation. We wrap the action in `useTransition` so the pills show
 * a pending state while the round-trip is in flight — React's documented
 * pattern for server-action mutations from a client component.
 *
 * Accessibility: the pills are rendered as `<button>` with
 * `role="radio"`/`aria-checked` — it's semantically a single-choice group.
 * The container has `role="radiogroup"` and a label. Tap targets exceed
 * 44px on mobile (see `py-3` + text scale).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Car } from 'lucide-react';
import { setMarketplaceMode } from '@/app/actions/marketplace-mode';
import type { MarketplaceMode } from '@/lib/marketplace/mode';

interface ModeToggleProps {
  /** Current mode, as read from the cookie by the server component. */
  currentMode: MarketplaceMode;
}

export default function ModeToggle({ currentMode }: ModeToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(mode: MarketplaceMode) {
    // Optimistic UX: if the user taps their current mode we skip the
    // server round-trip entirely. Avoids pointless cookie churn.
    if (mode === currentMode) return;

    startTransition(async () => {
      const res = await setMarketplaceMode(mode);
      if (!res.ok) {
        // The action validates inputs — this branch is defense-in-depth
        // for a future transport error. Fall through to refresh anyway so
        // the UI can't get stuck in a pending state.
         
        console.error('[mode-toggle] setMarketplaceMode failed', res.error);
      }
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Service mode"
      className="inline-flex items-stretch gap-2 w-full max-w-md mx-auto rounded-2xl p-1.5 bg-white border border-[#E8E8E8]"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
    >
      {(
        [
          { mode: 'at_salon' as const, label: 'At salon', Icon: Store },
          { mode: 'at_home' as const, label: 'At home', Icon: Car },
        ]
      ).map(({ mode, label, Icon }) => {
        const selected = currentMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isPending}
            onClick={() => handleSelect(mode)}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[15px] font-bold transition-all touch-target min-h-[44px] ${
              selected
                ? 'bg-[#1A1A1A] text-white shadow-md'
                : 'bg-transparent text-[#1A1A1A] hover:bg-[#F5F5F5]'
            } ${isPending ? 'opacity-70 cursor-wait' : ''}`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
