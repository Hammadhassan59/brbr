#!/usr/bin/env -S node --experimental-strip-types --no-warnings
//
// Force-migrate plaintext staff/partner PINs to scrypt hashes.
//
// The staff-login route already performs lazy migration on each successful
// sign-in: if the stored pin_code is plaintext, we hash it after verifying
// and write the hash back. But inactive staff, partners who haven't signed
// in since the fix shipped, and any row nobody touches will keep their
// plaintext PIN forever. This script walks both tables once and rehashes
// everything that isn't already a scrypt string.
//
// Safe to run multiple times — rows that are already hashed are skipped.
//
// Usage:
//   1. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env
//      (or source a .env.local that has them).
//   2. Run: bun run scripts/migrate-plaintext-pins.ts
//      or:  node --experimental-strip-types scripts/migrate-plaintext-pins.ts
//
// Flags:
//   --dry-run    report what would change without writing anything
//   --table=X    limit to 'staff' or 'salon_partners' (default: both)

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashPin, isHashedPin } from '../src/lib/pin-hash';

interface Row {
  id: string;
  name: string;
  pin_code: string | null;
}

interface Summary {
  table: string;
  scanned: number;
  alreadyHashed: number;
  migrated: number;
  skippedNull: number;
  skippedInvalid: number;
  failed: number;
}

function parseArgs(argv: string[]) {
  const args = { dryRun: false, table: 'both' as 'both' | 'staff' | 'salon_partners' };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--table=')) {
      const v = arg.split('=')[1];
      if (v === 'staff' || v === 'salon_partners') args.table = v;
      else {
        console.error(`Unknown --table value: ${v}`);
        process.exit(2);
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: migrate-plaintext-pins.ts [--dry-run] [--table=staff|salon_partners]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

// Intentionally `any` for the supabase client: the untyped createClient()
// return type changes between @supabase/supabase-js versions and we only use
// a handful of methods here. Runtime behavior is fully exercised.
type UntypedSupabase = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function migrateTable(
  supabase: UntypedSupabase,
  table: 'staff' | 'salon_partners',
  dryRun: boolean
): Promise<Summary> {
  const summary: Summary = {
    table,
    scanned: 0,
    alreadyHashed: 0,
    migrated: 0,
    skippedNull: 0,
    skippedInvalid: 0,
    failed: 0,
  };

  const { data, error } = await supabase
    .from(table)
    .select('id, name, pin_code');

  if (error) {
    console.error(`[${table}] select failed: ${error.message}`);
    summary.failed = -1;
    return summary;
  }

  const rows = (data || []) as unknown as Row[];
  summary.scanned = rows.length;

  for (const row of rows) {
    if (row.pin_code == null || row.pin_code === '') {
      summary.skippedNull++;
      continue;
    }

    if (isHashedPin(row.pin_code)) {
      summary.alreadyHashed++;
      continue;
    }

    // Plaintext row. Validate it's sensible (4 digits) before hashing.
    if (!/^\d{4}$/.test(row.pin_code)) {
      console.warn(`[${table}] ${row.name} (${row.id}): plaintext pin_code "${row.pin_code}" doesn't look like a 4-digit PIN — skipping`);
      summary.skippedInvalid++;
      continue;
    }

    const newHash = hashPin(row.pin_code);

    if (dryRun) {
      console.log(`[${table}] would migrate ${row.name} (${row.id})`);
      summary.migrated++;
      continue;
    }

    const { error: updErr } = await supabase
      .from(table)
      .update({ pin_code: newHash })
      .eq('id', row.id);

    if (updErr) {
      console.error(`[${table}] ${row.name} (${row.id}) update failed: ${updErr.message}`);
      summary.failed++;
    } else {
      console.log(`[${table}] migrated ${row.name} (${row.id})`);
      summary.migrated++;
    }
  }

  return summary;
}

function printSummary(summaries: Summary[]) {
  console.log('\n═══ Summary ═══');
  for (const s of summaries) {
    console.log(`  ${s.table}:`);
    console.log(`    scanned:         ${s.scanned}`);
    console.log(`    already hashed:  ${s.alreadyHashed}`);
    console.log(`    migrated:        ${s.migrated}`);
    console.log(`    skipped (null):  ${s.skippedNull}`);
    console.log(`    skipped (bad):   ${s.skippedInvalid}`);
    console.log(`    failed:          ${s.failed}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
    console.error('Set them in .env.local and source the file, or export them inline.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(args.dryRun ? '--- DRY RUN (no writes) ---' : '--- Rehashing plaintext PINs ---');

  const tables: Array<'staff' | 'salon_partners'> =
    args.table === 'both' ? ['staff', 'salon_partners'] : [args.table];

  const summaries: Summary[] = [];
  for (const table of tables) {
    summaries.push(await migrateTable(supabase, table, args.dryRun));
  }

  printSummary(summaries);

  const anyFailure = summaries.some((s) => s.failed !== 0);
  process.exit(anyFailure ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
