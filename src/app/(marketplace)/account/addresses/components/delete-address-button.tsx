'use client';

/**
 * `<DeleteAddressButton />` — client island rendered next to each address
 * row on `/account/addresses`. Wraps the destructive delete in a native
 * `confirm()` prompt and surfaces the server action's refusal message
 * (e.g. "This address is used by a pending or confirmed booking.") as a
 * toast instead of silently failing.
 *
 * We deliberately avoid shipping a fancy modal here — the consumer surface
 * already leans mobile-first, and a native confirm is faster + zero deps.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { deleteConsumerAddress } from '@/app/actions/consumer-addresses';

interface Props {
  addressId: string;
  label: string;
}

export function DeleteAddressButton({ addressId, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const handleClick = () => {
    if (busy || pending) return;
    const ok = window.confirm(
      `Delete the "${label}" address? This can't be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    startTransition(async () => {
      try {
        const res = await deleteConsumerAddress({ id: addressId });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success('Address deleted');
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  };

  const isBusy = busy || pending;
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isBusy}
      className="inline-flex items-center gap-1 rounded-lg border border-[#E8E8E8] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#B00020] hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`Delete ${label} address`}
    >
      {isBusy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      )}
      Delete
    </button>
  );
}
