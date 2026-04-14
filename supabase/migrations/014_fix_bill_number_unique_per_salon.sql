-- 014_fix_bill_number_unique_per_salon.sql
-- Bill numbers are generated per-salon (format BB-YYYYMMDD-NNN), but the initial
-- schema had a GLOBAL unique constraint on bill_number. Result: when two salons
-- each created their first bill of the day, the second one always collided on
-- BB-YYYYMMDD-001 and failed with "Failed to generate unique bill number after 3 attempts".
--
-- Fix: replace the global unique with a composite unique on (salon_id, bill_number).
-- Matches the generator's intent in src/app/actions/bills.ts.

ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_bill_number_key;

ALTER TABLE bills ADD CONSTRAINT bills_salon_bill_number_unique
  UNIQUE (salon_id, bill_number);
