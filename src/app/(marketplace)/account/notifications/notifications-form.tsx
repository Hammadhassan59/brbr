'use client';

/**
 * Notifications preference toggles (client).
 *
 * Each toggle fires an immediate server action with a merge-patch payload
 * (only the key that flipped). On failure we revert the local state so the
 * UI never drifts from the server's truth. On success we leave the local
 * state flipped — `router.refresh()` is NOT called per toggle because it
 * would bust any other client state on the page; the next navigation re-reads
 * from the DB naturally.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';

import { Switch } from '@/components/ui/switch';
import { updateConsumerNotificationPrefs } from '@/app/actions/consumer-profile';

export interface NotificationPref {
  key: string;
  title: string;
  description: string;
  defaultValue: boolean;
}

interface NotificationsFormProps {
  prefs: NotificationPref[];
  initialValues: Record<string, boolean>;
}

export function NotificationsForm({
  prefs,
  initialValues,
}: NotificationsFormProps) {
  const [values, setValues] = useState<Record<string, boolean>>(initialValues);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function toggle(key: string, next: boolean) {
    const prev = values[key];
    // Optimistic update: flip immediately so the thumb animates now, not after
    // the RTT. Revert on failure.
    setValues((v) => ({ ...v, [key]: next }));
    setPendingKey(key);
    try {
      const res = await updateConsumerNotificationPrefs({
        prefs: { [key]: next },
      });
      if (!res.ok) {
        setValues((v) => ({ ...v, [key]: prev }));
        toast.error(res.error);
        return;
      }
      // Merge server-echo back in case it contains keys we don't render. The
      // visible toggles will match because the server always echoes the full
      // merged blob.
      setValues((v) => ({ ...v, ...res.data.prefs }));
    } catch (err) {
      setValues((v) => ({ ...v, [key]: prev }));
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[#E8E8E8] bg-white">
      <ul>
        {prefs.map((p, i) => {
          const current = values[p.key] ?? p.defaultValue;
          const isPending = pendingKey === p.key;
          return (
            <li
              key={p.key}
              className={`flex items-start justify-between gap-4 px-4 py-4 ${
                i === prefs.length - 1 ? '' : 'border-b border-[#F5F5F5]'
              }`}
            >
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-[#1A1A1A]">
                  {p.title}
                </p>
                <p className="mt-1 text-[12px] text-[#666]">{p.description}</p>
              </div>
              <div className="mt-1 shrink-0">
                <Switch
                  checked={current}
                  onCheckedChange={(next) => toggle(p.key, Boolean(next))}
                  disabled={isPending}
                  aria-label={p.title}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
