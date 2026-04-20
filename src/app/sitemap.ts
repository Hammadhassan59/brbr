import type { MetadataRoute } from 'next';
import { ALL_CITIES } from '@/lib/seo/cities';
import { VERTICALS } from '@/lib/seo/verticals';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://icut.pk';
  const now = new Date();

  const core: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/refund`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];

  // Programmatic SEO: one URL per (vertical, city) pair. Pages are
  // statically generated at build time via generateStaticParams and feed
  // distinct per-city copy from src/lib/seo/.
  const programmatic: MetadataRoute.Sitemap = VERTICALS.flatMap((v) =>
    ALL_CITIES.map((c) => ({
      url: `${baseUrl}/${v.route}/${c.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  );

  return [...core, ...programmatic];
}
