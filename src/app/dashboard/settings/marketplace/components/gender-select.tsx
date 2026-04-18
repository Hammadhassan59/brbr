'use client';

import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SalonGenderType } from '@/lib/marketplace/settings-shared';

/**
 * Gender classification radio for the salon-side marketplace opt-in.
 *
 * Migration 041 adds `branches.gender_type salon_gender_type NOT NULL`-style
 * enum (`'men' | 'women' | 'mixed'`). The marketplace is launching men-only;
 * the superadmin flag `marketplace_women_enabled` in `platform_settings`
 * decides whether women/mixed salons are surfaced on the consumer side.
 *
 * The column has to be TRUTHFUL regardless of the platform flag — flipping
 * the flag later should be a one-switch change, not a retroactive data
 * fix-up. Hence women/mixed remain selectable here (not disabled-greyed),
 * but carry an info tooltip explaining the current visibility state so the
 * owner knows what to expect. If they're unsure, "Men" is the safe default
 * for day-one launch.
 *
 * Presentational only. The parent page owns state and persistence.
 */

const DEFAULT_HINT =
  "Women's and mixed salons will be enabled when iCut opens the marketplace to them. Pick 'Men' for now if you're unsure.";

interface Option {
  value: SalonGenderType;
  label: string;
  /**
   * When true, the option is gated behind the `marketplace_women_enabled`
   * superadmin flag. Still selectable (so the column stays truthful), but we
   * surface a tooltip so the owner knows listings won't appear on the
   * consumer directory yet.
   */
  gated: boolean;
}

const OPTIONS: Option[] = [
  { value: 'men', label: 'Men', gated: false },
  { value: 'women', label: 'Women', gated: true },
  { value: 'mixed', label: 'Mixed', gated: true },
];

interface Props {
  value: SalonGenderType | null;
  onChange: (v: SalonGenderType) => void;
  disabled?: boolean;
}

export function GenderSelect({ value, onChange, disabled = false }: Props) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">Salon type</Label>
      <p className="text-xs text-muted-foreground">
        Who does this branch serve? This classification is required before you
        can list on the marketplace.
      </p>
      <div
        role="radiogroup"
        aria-label="Salon gender type"
        className="grid grid-cols-3 gap-2 pt-1"
      >
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          const baseBtn =
            'relative w-full rounded-md border px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gold/40';
          const stateClass = selected
            ? 'border-gold bg-gold/10 text-foreground'
            : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40';
          const disabledClass = disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer';

          const button = (
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => !disabled && onChange(opt.value)}
              className={`${baseBtn} ${stateClass} ${disabledClass}`}
            >
              <span className="flex items-center justify-center gap-1.5">
                {opt.label}
                {opt.gated && (
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </span>
            </button>
          );

          if (!opt.gated) {
            return <div key={opt.value}>{button}</div>;
          }

          return (
            <Tooltip key={opt.value}>
              <TooltipTrigger render={button} />
              <TooltipContent side="top" className="max-w-xs text-center">
                {DEFAULT_HINT}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
