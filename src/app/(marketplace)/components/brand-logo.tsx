import { Scissors } from 'lucide-react';

/**
 * Marketplace wordmark — shown in the consumer top bar. Kept deliberately
 * tiny (icon + `iCut` wordmark) so it fits in a compact mobile header next
 * to the account menu/sign-in link without crowding the right-side actions.
 *
 * Static server-rendered; no state, no effects. Sizing scales at `md:` so
 * the same component looks right on a phone and a laptop.
 */
export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Scissors
        className="h-5 w-5 text-gold md:h-6 md:w-6"
        aria-hidden="true"
      />
      <span className="font-heading text-lg font-bold tracking-tight md:text-xl">
        iCut
      </span>
    </span>
  );
}
