/**
 * `/account/addresses` — saved-addresses list.
 *
 * Server component. The parent `<AccountLayout />` already redirects
 * unauthenticated sessions, so we can safely call `listConsumerAddresses`
 * without a second guard. Failure returns an empty list rather than
 * crashing — first-time consumers see the "Add address" empty state.
 *
 * Each row has [Edit] (links to `/[id]/edit`) and [Delete] (client island).
 * Adding is a dedicated page `/new` rather than an inline drawer so the
 * map-picker has full real estate on mobile.
 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { MapPin, Plus } from 'lucide-react';

import { listConsumerAddresses } from '@/app/actions/consumer-addresses';

import { DeleteAddressButton } from './components/delete-address-button';

export const metadata: Metadata = {
  title: 'Saved addresses',
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  const res = await listConsumerAddresses();
  const addresses = res.ok ? res.data : [];

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#1A1A1A]">
            Saved addresses
          </h1>
          <p className="mt-1 text-[13px] text-[#888]">
            Pre-filled during home-service checkout.
          </p>
        </div>
        <Link
          href="/account/addresses/new"
          className="inline-flex items-center gap-1 rounded-lg bg-[#1A1A1A] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#1A1A1A]/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add address
        </Link>
      </header>

      {addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white p-8 text-center">
          <MapPin className="mx-auto h-6 w-6 text-[#CCC]" aria-hidden />
          <p className="mt-3 text-[14px] font-semibold text-[#1A1A1A]">
            No saved addresses yet
          </p>
          <p className="mt-1 text-[12px] text-[#888]">
            Save home or office to skip the picker next time you book.
          </p>
          <Link
            href="/account/addresses/new"
            className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#1A1A1A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1A1A1A]/90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add your first address
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-[#E8E8E8] bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#1A1A1A]">
                  <span className="truncate">{a.label}</span>
                  {a.is_default && (
                    <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1A1A1A]">
                      Default
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[12px] text-[#666] break-words">{a.street}</p>
                <p className="mt-0.5 text-[11px] text-[#999]">
                  {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Link
                  href={`/account/addresses/${a.id}/edit`}
                  className="inline-flex items-center rounded-lg border border-[#E8E8E8] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1A1A1A] hover:bg-[#F5F5F5]"
                >
                  Edit
                </Link>
                <DeleteAddressButton addressId={a.id} label={a.label} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
