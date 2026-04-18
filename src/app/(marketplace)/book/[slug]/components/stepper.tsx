'use client';

/**
 * Top-of-wizard progress indicator. Shows 3 or 4 dots depending on mode.
 * Clicking a previously-completed step jumps back — clicking a future step is
 * a no-op (the user must complete the current step first).
 *
 * Deliberately simple HTML — no slide-out nav or route-level breadcrumbs.
 * The wizard lives at one URL and its steps are internal state.
 */

import type { MarketplaceMode } from '@/lib/marketplace/mode';

interface Props {
  current: 1 | 2 | 3 | 4;
  mode: MarketplaceMode;
  onJump: (step: 1 | 2 | 3 | 4) => void;
}

export function Stepper({ current, mode, onJump }: Props) {
  const steps: Array<{ n: 1 | 2 | 3 | 4; label: string }> =
    mode === 'at_home'
      ? [
          { n: 1, label: 'Address' },
          { n: 2, label: 'Services' },
          { n: 3, label: 'Time' },
          { n: 4, label: 'Review' },
        ]
      : [
          { n: 2, label: 'Services' },
          { n: 3, label: 'Time' },
          { n: 4, label: 'Review' },
        ];

  return (
    <ol
      className="flex items-center gap-2"
      aria-label="Booking steps"
    >
      {steps.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        const clickable = done;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              onClick={() => clickable && onJump(s.n)}
              className={`flex items-center gap-2 text-[12px] font-semibold transition-colors ${
                active
                  ? 'text-[#1A1A1A]'
                  : done
                    ? 'text-[#1A1A1A]/70 hover:text-[#1A1A1A]'
                    : 'text-[#BBB]'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  active
                    ? 'bg-[#1A1A1A] text-white'
                    : done
                      ? 'bg-gold text-[#1A1A1A]'
                      : 'bg-[#EEE] text-[#888]'
                }`}
              >
                {s.n === 1 ? '1' : s.n === 2 ? '2' : s.n === 3 ? '3' : '4'}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`mx-1 h-px flex-1 ${
                  done ? 'bg-gold' : 'bg-[#EEE]'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
