'use client';

/**
 * Step 2 — pick services.
 *
 * List of the salon's services with checkboxes. Home mode hides services with
 * `available_at_home === false`. Prices shown are mode-aware (base for
 * at_salon, marked-up-and-rounded for at_home) via `displayPriceForMode`.
 *
 * Sticky footer shows the running total: the sum of display prices. We do
 * NOT show the Rs 300 home service charge here — that lines up only on the
 * review step (Foodpanda-style breakdown).
 */

import { Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { BranchService } from '@/lib/marketplace/queries';
import type { MarketplaceMode } from '@/lib/marketplace/mode';
import { displayPriceForMode } from '@/lib/marketplace/pricing';

interface Props {
  services: BranchService[];
  mode: MarketplaceMode;
  selectedIds: string[];
  onToggle: (serviceId: string) => void;
  onBack?: () => void;
  onContinue: () => void;
}

function formatPrice(rupees: number): string {
  return new Intl.NumberFormat('en-PK').format(Math.round(rupees));
}

export function StepServices({
  services,
  mode,
  selectedIds,
  onToggle,
  onBack,
  onContinue,
}: Props) {
  const visible =
    mode === 'at_home'
      ? services.filter((s) => s.available_at_home !== false)
      : services;

  const selectedSet = new Set(selectedIds);
  const selected = visible.filter((s) => selectedSet.has(s.id));
  const runningTotal = selected.reduce(
    (sum, s) => sum + displayPriceForMode(s.base_price, mode),
    0,
  );

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <div>
        <h2 className="font-heading text-lg font-bold text-[#1A1A1A]">
          Pick services
        </h2>
        <p className="mt-1 text-[13px] text-[#888]">
          You can pick more than one.
          {mode === 'at_home' && ' Home service pricing applies.'}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
          <p className="text-[13px] text-[#888]">
            {mode === 'at_home'
              ? 'No services are offered at home yet.'
              : 'No services listed yet.'}
          </p>
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white"
          aria-label="Services"
        >
          {visible.map((svc, i) => {
            const checked = selectedSet.has(svc.id);
            const price = displayPriceForMode(svc.base_price, mode);
            return (
              <li
                key={svc.id}
                className={i === visible.length - 1 ? '' : 'border-b border-[#F0F0F0]'}
                data-testid="wizard-service-row"
                data-service-id={svc.id}
                data-service-price={price}
                data-service-mode={mode}
                data-checked={checked ? 'true' : 'false'}
              >
                <label className="flex cursor-pointer items-center gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(svc.id)}
                    className="h-5 w-5 rounded border-[#CCC] text-[#1A1A1A] focus:ring-gold"
                    aria-label={`Select ${svc.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">
                      {svc.name}
                    </p>
                    {svc.duration_minutes != null && svc.duration_minutes > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[#888]">
                        <Clock className="h-3 w-3" aria-hidden />
                        {svc.duration_minutes} min
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-bold text-[#1A1A1A]">
                      Rs {formatPrice(price)}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sticky footer: total + continue */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-[#E8E8E8] bg-white px-4 py-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 md:max-w-none">
          <div>
            <p className="text-[11px] uppercase tracking-[1.5px] text-[#888]">
              Subtotal
            </p>
            <p className="text-lg font-bold text-[#1A1A1A]">
              Rs {formatPrice(runningTotal)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                className="h-11"
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              onClick={onContinue}
              disabled={selectedIds.length === 0}
              className="h-11 bg-[#1A1A1A] px-6 text-[14px] font-bold text-white hover:bg-[#1A1A1A]/90 disabled:bg-[#BBB]"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
