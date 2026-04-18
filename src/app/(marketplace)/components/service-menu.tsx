/**
 * Mode-aware service menu — groups services by category when the salon has
 * enough services to benefit from the grouping, otherwise renders a flat list.
 *
 * Server component. Reads the display price from `pricing.ts`:
 *
 *   - `at_salon` mode → shows raw `base_price` from `services` table.
 *   - `at_home` mode → hides services with `available_at_home = false` and
 *     shows the rounded-up marked-up price (see
 *     `src/lib/marketplace/pricing.ts`).
 *
 * The consumer never sees a "base + markup" breakdown on this list — decision
 * 20 in the plan says consumers see the marked-up price as THE price. The
 * flat Rs 300 service charge shows up as a separate line on the cart later.
 */
import { Clock } from 'lucide-react';

import type { BranchService } from '@/lib/marketplace/queries';
import type { MarketplaceMode } from '@/lib/marketplace/mode';
import { displayPriceForMode } from '@/lib/marketplace/pricing';

interface ServiceMenuProps {
  services: BranchService[];
  mode: MarketplaceMode;
}

/** Human-readable category label (matches the enum in `services.category`). */
const CATEGORY_LABEL: Record<string, string> = {
  haircut: 'Haircuts',
  color: 'Color',
  treatment: 'Treatments',
  facial: 'Facials',
  waxing: 'Waxing',
  bridal: 'Bridal',
  nails: 'Nails',
  massage: 'Massage',
  beard: 'Beard',
  other: 'Other',
};

const CATEGORY_ORDER: string[] = [
  'haircut',
  'beard',
  'color',
  'treatment',
  'facial',
  'waxing',
  'bridal',
  'nails',
  'massage',
  'other',
];

/** Threshold above which we switch from a flat list to category-grouped. */
const GROUPING_THRESHOLD = 5;

/** Format a whole-rupee price. */
function formatPrice(rupees: number): string {
  // No localization needed — every seeded city is Pakistan, PKR-only in
  // Phase 1. `Intl.NumberFormat('en-PK')` keeps thousand separators.
  return new Intl.NumberFormat('en-PK').format(Math.round(rupees));
}

export default function ServiceMenu({ services, mode }: ServiceMenuProps) {
  // Apply home-eligibility filter first so both the flat and grouped paths
  // see the same input set.
  const visible =
    mode === 'at_home'
      ? services.filter((s) => s.available_at_home !== false)
      : services;

  if (visible.length === 0) {
    return (
      <section className="mb-6" aria-labelledby="service-menu-heading">
        <h2
          id="service-menu-heading"
          className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px] text-gold"
        >
          Services
        </h2>
        <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
          <p className="text-[13px] text-[#888]">
            {mode === 'at_home'
              ? 'No services available for home service yet.'
              : 'No services listed yet.'}
          </p>
        </div>
      </section>
    );
  }

  const useGroups = visible.length > GROUPING_THRESHOLD;

  return (
    <section className="mb-6" aria-labelledby="service-menu-heading">
      <h2
        id="service-menu-heading"
        className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px] text-gold"
      >
        Services
      </h2>

      {useGroups ? (
        <GroupedServiceList services={visible} mode={mode} />
      ) : (
        <FlatServiceList services={visible} mode={mode} />
      )}
    </section>
  );
}

function FlatServiceList({
  services,
  mode,
}: {
  services: BranchService[];
  mode: MarketplaceMode;
}) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white">
      {services.map((svc, i) => (
        <ServiceRow
          key={svc.id}
          service={svc}
          mode={mode}
          isLast={i === services.length - 1}
        />
      ))}
    </ul>
  );
}

function GroupedServiceList({
  services,
  mode,
}: {
  services: BranchService[];
  mode: MarketplaceMode;
}) {
  const groups = new Map<string, BranchService[]>();
  for (const svc of services) {
    const key = svc.category ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(svc);
  }

  const orderedKeys = [
    ...CATEGORY_ORDER.filter((k) => groups.has(k)),
    ...[...groups.keys()].filter((k) => !CATEGORY_ORDER.includes(k)),
  ];

  return (
    <div className="space-y-4">
      {orderedKeys.map((cat) => {
        const list = groups.get(cat)!;
        return (
          <div key={cat}>
            <h3 className="mb-2 text-[12px] font-bold text-[#1A1A1A]">
              {CATEGORY_LABEL[cat] ?? 'Other'}
            </h3>
            <ul className="overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white">
              {list.map((svc, i) => (
                <ServiceRow
                  key={svc.id}
                  service={svc}
                  mode={mode}
                  isLast={i === list.length - 1}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ServiceRow({
  service,
  mode,
  isLast,
}: {
  service: BranchService;
  mode: MarketplaceMode;
  isLast: boolean;
}) {
  const price = displayPriceForMode(service.base_price, mode);

  return (
    <li
      className={`flex items-center justify-between gap-4 p-4 ${
        isLast ? '' : 'border-b border-[#F0F0F0]'
      }`}
      data-testid="service-row"
      data-service-id={service.id}
      data-service-price={price}
      data-service-mode={mode}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-[#1A1A1A]">
          {service.name}
        </p>
        {service.duration_minutes != null && service.duration_minutes > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[#888]">
            <Clock className="h-3 w-3" aria-hidden />
            {service.duration_minutes} min
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-bold text-[#1A1A1A]">
          Rs {formatPrice(price)}
        </p>
      </div>
    </li>
  );
}
