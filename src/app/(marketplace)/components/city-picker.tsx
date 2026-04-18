/**
 * City picker grid — server component.
 *
 * Reads the 5 seeded cities from the `cities` table (migration 041) via the
 * shared `getAllCities()` helper so this component benefits from the same
 * 6-hour cache + `marketplace:cities` tag invalidation that the directory
 * pages use — no duplicate DB hits per render, and the superadmin's
 * city-row edits invalidate every consumer surface in one call.
 *
 * Each city renders as a tappable card linking to `/barbers/[city]` (the
 * directory page is being built in parallel by the Directory-pages agent;
 * the links will resolve once that route ships).
 *
 * If the `cities` table is not yet applied in this environment, the helper
 * returns an empty array and we render an explicit empty state rather than
 * crashing the home page.
 */

import Link from 'next/link';

import { getAllCities } from '@/lib/marketplace/queries';

export default async function CityPicker() {
  // `getAllCities` swallows its own errors, so no try/catch here.
  const cities = await getAllCities();

  if (cities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
        <p className="text-[13px] text-[#888]">
          Cities are being loaded — check back in a moment.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] mb-3">
        Pick your city
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cities.map((city) => (
          <Link
            key={city.id}
            href={`/barbers/${city.slug}`}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-[#E8E8E8] bg-white p-4 min-h-[64px] transition-all hover:-translate-y-0.5 hover:border-[#1A1A1A]/20 hover:shadow-md touch-target"
          >
            <span className="text-[15px] font-bold text-[#1A1A1A]">
              {city.name}
            </span>
            <span
              aria-hidden="true"
              className="text-[#888] group-hover:text-[#1A1A1A] transition-colors text-lg"
            >
              &rarr;
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
