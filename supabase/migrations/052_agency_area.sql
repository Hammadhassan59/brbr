-- 052_agency_area.sql
-- Super_admin can assign a territory/area to each agency (free-form text:
-- "Lahore DHA + Johar Town", "Multan + Bahawalpur", etc.). Surfaced to the
-- agency admin on their overview so they know their scope, and visible on
-- the admin-side agency detail page.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS area text;
