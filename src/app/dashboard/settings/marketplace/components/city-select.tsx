'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * City dropdown populated from the `cities` table (migration 041).
 *
 * Cities list is loaded server-side by `getMarketplaceSettings` and passed
 * in — this component is presentation-only so we don't do N+1 reads on
 * every re-render.
 */

interface City {
  id: string;
  slug: string;
  name: string;
}

interface Props {
  value: string | null;
  cities: City[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
}

// Select primitive rejects empty-string values, so we swap in a sentinel
// for the "not selected" state and translate at the callback boundary.
const UNSET_SENTINEL = '__unset__';

export function CitySelect({ value, cities, onChange, disabled = false }: Props) {
  const isEmpty = cities.length === 0;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">City</Label>
      <Select
        value={value ?? UNSET_SENTINEL}
        onValueChange={(v) => onChange(v === UNSET_SENTINEL ? null : v)}
        disabled={disabled || isEmpty}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              isEmpty
                ? 'Cities not loaded (schema pending)'
                : 'Pick a city…'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {!value && (
            <SelectItem value={UNSET_SENTINEL} disabled>
              Pick a city…
            </SelectItem>
          )}
          {cities.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isEmpty && (
        <p className="text-xs text-muted-foreground">
          The <code className="text-[11px]">cities</code> table hasn&rsquo;t been
          populated yet — this will work once migration 041 lands.
        </p>
      )}
    </div>
  );
}
