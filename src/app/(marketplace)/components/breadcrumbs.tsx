import Link from 'next/link';

/**
 * Shared breadcrumb nav for the consumer marketplace, with an embedded
 * `BreadcrumbList` JSON-LD emitter so every directory page gets clean
 * structured data for free (per
 * `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md` → "SEO
 * implementation" — `CollectionPage + BreadcrumbList`).
 *
 * The server component emits two things:
 *   1. A semantic `<nav aria-label="Breadcrumb">` with a `<ol>` of links
 *      for screen readers and visible UI.
 *   2. A `<script type="application/ld+json">` whose `BreadcrumbList`
 *      mirrors the same sequence. Google uses this to render the breadcrumb
 *      trail in SERP results instead of the ugly URL tail.
 *
 * Absolute URL contract: every `url` passed in MUST be absolute
 * (`https://icut.pk/...`) because schema.org's `BreadcrumbList.itemListElement[*].item`
 * expects a full URL. We do not try to resolve them from `<base>` here —
 * callers construct the URL from `siteOrigin()` / the deployment's
 * `metadataBase`.
 *
 * Accessibility: the last breadcrumb is rendered as plain text (no link),
 * matches WAI-ARIA Authoring Practices for breadcrumb nav. Separators are
 * aria-hidden so screen readers read "Home, Pakistan, Karachi" rather than
 * "Home slash Pakistan slash Karachi".
 */

export interface BreadcrumbItem {
  /** Human-readable label (e.g. "Karachi"). */
  name: string;
  /**
   * Absolute URL (`https://icut.pk/barbers/karachi`). Required for both
   * the visible link and the JSON-LD `item` field — the last crumb omits
   * the link in the visible UI but still contributes a URL to the JSON-LD
   * for completeness.
   */
  url: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Optional extra className on the outer `<nav>`. */
  className?: string;
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className={`text-[12px] text-[#666] ${className}`.trim()}
      >
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li key={`${item.url}-${i}`} className="flex items-center gap-1.5">
                {isLast ? (
                  <span
                    aria-current="page"
                    className="font-semibold text-[#1A1A1A]"
                  >
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link
                      href={item.url}
                      className="hover:text-[#1A1A1A] hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span aria-hidden className="text-[#BBB]">
                      /
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {/* JSON-LD emitter — the payload is trusted (we build the strings)
          so dangerouslySetInnerHTML is safe; we still JSON.stringify to
          avoid a stray `</script>` sequence. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />
    </>
  );
}
