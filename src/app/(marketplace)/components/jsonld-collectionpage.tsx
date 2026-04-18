/**
 * JSON-LD emitter for directory pages (`/barbers`, `/barbers/[city]`).
 *
 * Per `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`, "SEO
 * implementation": each directory surface ships a `CollectionPage` graph
 * whose `mainEntity` is an `ItemList` of the listed salons. Google uses the
 * `ItemList` to understand the page as a list of entities (rather than
 * generic content), which unlocks rich-result eligibility on SERP.
 *
 * This component is intentionally thin: it takes a rendered shape the page
 * has already normalized and drops a single `<script type="application/ld+json">`
 * tag into the DOM. Keeping the JSON-LD out of the visible tree means it
 * never interferes with React hydration (the payload is inert string data).
 *
 * Absolute URL contract: `url` on the page and `items[*].url` must be
 * absolute (`https://icut.pk/...`). schema.org requires this; search
 * engines silently ignore relative URLs.
 *
 * Security: payload is fully server-constructed from our own DB rows and
 * the page's own props — no user-controlled HTML. We `JSON.stringify` to
 * escape any embedded `</script>` sequences (extremely unlikely in a salon
 * name, but cheap insurance).
 */

export interface JsonLdCollectionPageItem {
  /** Display name for the item (e.g. a salon name). */
  name: string;
  /** Absolute URL to the item's detail page. */
  url: string;
}

export interface JsonLdCollectionPageProps {
  /** Page-level name (e.g. "Best Barbers in Karachi — iCut"). */
  name: string;
  /** Absolute URL of the page itself. */
  url: string;
  /** Page-level description (same copy as `<meta name="description">`). */
  description: string;
  /** Entities listed on the page — salon cards, typically. */
  items: JsonLdCollectionPageItem[];
}

export default function JsonLdCollectionPage({
  name,
  url,
  description,
  items,
}: JsonLdCollectionPageProps) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    url,
    description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
