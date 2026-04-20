import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ALL_CITIES, getCity } from '@/lib/seo/cities';
import { getVertical } from '@/lib/seo/verticals';
import { generatePageContent, jsonLd } from '@/lib/seo/page-content';
import { SEOPage } from '@/components/seo-page';

const VERTICAL_SLUG = 'salon-pos';

export async function generateStaticParams() {
  return ALL_CITIES.map((c) => ({ city: c.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> },
): Promise<Metadata> {
  const { city: slug } = await params;
  const city = getCity(slug);
  const vertical = getVertical(VERTICAL_SLUG);
  if (!city || !vertical) return {};
  const content = generatePageContent(city, vertical);
  return {
    title: content.title,
    description: content.description,
    alternates: { canonical: content.canonicalPath },
    openGraph: {
      title: content.title,
      description: content.description,
      url: content.canonicalPath,
      siteName: 'iCut',
    },
  };
}

export default async function Page(
  { params }: { params: Promise<{ city: string }> },
) {
  const { city: slug } = await params;
  const city = getCity(slug);
  const vertical = getVertical(VERTICAL_SLUG);
  if (!city || !vertical) return notFound();
  const content = generatePageContent(city, vertical);
  const ld = jsonLd(content, 'https://icut.pk');
  return <SEOPage content={content} city={city} vertical={vertical} jsonLdString={ld} />;
}
