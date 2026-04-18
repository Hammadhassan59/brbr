/**
 * Shared types for the booking wizard — kept in a sibling file so the client
 * components and the test file can pull them in without pulling in the
 * reducer or hooks.
 */

import type { BranchService } from '@/lib/marketplace/queries';

export interface WizardBranch {
  id: string;
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  offers_home_service: boolean;
  home_service_radius_km: number | null;
  working_hours: Record<string, unknown> | null;
  services: BranchService[];
}

export interface WizardConsumer {
  userId: string;
  name: string;
  phone: string;
}

/**
 * Canonical day-of-week key for the `branches.working_hours` jsonb blob.
 * Values are stored keyed by lower-case English weekday.
 */
export const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface WorkingHoursEntry {
  open: string;   // "HH:MM"
  close: string;  // "HH:MM"
  closed?: boolean;
}

/**
 * Defensive parse of `working_hours`. Returns one entry per weekday; entries
 * we can't decode become `closed`. Never throws.
 */
export function parseWorkingHours(
  raw: Record<string, unknown> | null | undefined,
): Record<WeekdayKey, WorkingHoursEntry> {
  const out: Record<WeekdayKey, WorkingHoursEntry> = {
    sunday:    { open: '10:00', close: '19:00', closed: true },
    monday:    { open: '10:00', close: '19:00' },
    tuesday:   { open: '10:00', close: '19:00' },
    wednesday: { open: '10:00', close: '19:00' },
    thursday:  { open: '10:00', close: '19:00' },
    friday:    { open: '10:00', close: '19:00' },
    saturday:  { open: '10:00', close: '19:00' },
  };
  if (!raw || typeof raw !== 'object') return out;
  for (const day of WEEKDAY_KEYS) {
    const entry = (raw as Record<string, unknown>)[day];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { open?: unknown; close?: unknown; closed?: unknown };
    if (e.closed === true) {
      out[day] = { open: '00:00', close: '00:00', closed: true };
      continue;
    }
    const open = typeof e.open === 'string' ? e.open : out[day].open;
    const close = typeof e.close === 'string' ? e.close : out[day].close;
    out[day] = { open, close, closed: false };
  }
  return out;
}
