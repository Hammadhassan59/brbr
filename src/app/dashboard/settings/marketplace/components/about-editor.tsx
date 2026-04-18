'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * "About" textarea for the salon-side marketplace opt-in.
 *
 * Enforces the ≥100 character requirement visually. The server-side gate in
 * `updateMarketplaceListing` re-checks this when the listing toggle is
 * flipped to true, so even a crafted client POST can't publish with a
 * short bio. Max length is 4000 to match the zod schema.
 */

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  minChars?: number;
  maxChars?: number;
}

export function AboutEditor({
  value,
  onChange,
  disabled = false,
  minChars = 100,
  maxChars = 4000,
}: Props) {
  const len = value.trim().length;
  const valid = len >= minChars && len <= maxChars;
  const remaining = minChars - len;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">About this branch</Label>
        <span
          className={`text-xs font-medium ${
            valid
              ? 'text-green-600'
              : len > 0
                ? 'text-amber-600'
                : 'text-muted-foreground'
          }`}
        >
          {len} / {minChars}+
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="What makes this branch special? Services, vibe, who it's for — 2-3 sentences is plenty."
        rows={5}
        maxLength={maxChars}
      />
      {!valid && len > 0 && (
        <p className="text-xs text-muted-foreground">
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? '' : 's'} needed.`
            : `Keep it under ${maxChars} characters.`}
        </p>
      )}
    </div>
  );
}
