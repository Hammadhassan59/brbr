import Script from 'next/script';

/**
 * Umami — self-hosted visitor analytics. Runs on our own VPS at
 * NEXT_PUBLIC_UMAMI_URL (default https://analytics.icut.pk). No third
 * party sees the data; dashboard login lives on the same VPS.
 *
 * Renders nothing if NEXT_PUBLIC_UMAMI_WEBSITE_ID is unset, so local
 * dev and any env without Umami provisioned stays silent.
 *
 * Dashboard: https://analytics.icut.pk
 */
export function Umami() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;
  const base = (process.env.NEXT_PUBLIC_UMAMI_URL ?? 'https://analytics.icut.pk').replace(/\/$/, '');
  return (
    <Script
      src={`${base}/script.js`}
      data-website-id={websiteId}
      strategy="afterInteractive"
      defer
    />
  );
}
