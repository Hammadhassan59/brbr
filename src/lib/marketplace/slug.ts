/**
 * Branch slug generator for the iCut marketplace.
 *
 * Produces a URL-safe, kebab-case slug in the form `<name>-<area>-<city>`,
 * deduplicating collisions by appending `-2`, `-3`, … (mirrors WordPress-style
 * post slug collisions).
 *
 * Called from two places:
 *   1. Migration 041 backfills placeholder slugs (`branch-<id8>`); real slugs
 *      are written by this helper the first time an owner toggles
 *      "List on iCut" in Settings.
 *   2. The branch-create flow also calls this whenever a branch is added
 *      after Phase 0 ships.
 *
 * `area` is best-effort: branches have no structured neighbourhood column,
 * so callers typically pass a user-entered hint (e.g. "dha", "gulberg") or
 * the first meaningful token from `branches.address`. Pass an empty string
 * and the helper will omit the area segment.
 */

const KEBAB_REPLACE = /[^a-z0-9]+/g;
const TRIM_DASHES = /^-+|-+$/g;

/** Slugify a single segment: lowercase, strip diacritics, collapse non-alphanum to `-`. */
function slugifySegment(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop combining marks
    .toLowerCase()
    .replace(KEBAB_REPLACE, "-")
    .replace(TRIM_DASHES, "");
}

/**
 * Generate a unique branch slug.
 *
 * @param branchName e.g. "Fatima Beauty Lounge"
 * @param area       e.g. "DHA Phase 5" — pass "" to skip the area segment
 * @param cityName   e.g. "Karachi"
 * @param existingSlugs set of already-taken slugs to dedupe against
 * @returns a kebab-case slug not present in `existingSlugs`
 *
 * @example
 *   generateBranchSlug("Fatima Beauty Lounge", "DHA Phase 5", "Karachi", new Set())
 *   // => "fatima-beauty-lounge-dha-phase-5-karachi"
 *
 *   generateBranchSlug("Salon A", "", "Lahore", new Set(["salon-a-lahore"]))
 *   // => "salon-a-lahore-2"
 */
export function generateBranchSlug(
  branchName: string,
  area: string,
  cityName: string,
  existingSlugs: Iterable<string>
): string {
  const taken: Set<string> =
    existingSlugs instanceof Set ? existingSlugs : new Set<string>(existingSlugs);

  const parts = [slugifySegment(branchName), slugifySegment(area), slugifySegment(cityName)].filter(
    (segment) => segment.length > 0
  );

  // Fallback for pathological all-empty input — caller should avoid this,
  // but we never want to return the empty string or just dashes.
  const base = parts.length > 0 ? parts.join("-") : "branch";

  if (!taken.has(base)) return base;

  let suffix = 2;
   
  while (true) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
    suffix += 1;
  }
}

/** Exported for unit tests. */
export const _internal = { slugifySegment };
