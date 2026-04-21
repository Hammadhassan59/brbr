import Script from 'next/script';

/**
 * Umami — self-hosted visitor analytics. Runs on our own VPS, served
 * same-origin by Caddy under /umami/* (see Caddyfile + docker-compose.yml).
 * No third party sees the data; dashboard login lives on icut.pk itself.
 *
 * Renders nothing if NEXT_PUBLIC_UMAMI_WEBSITE_ID is unset, so local dev
 * and any env without Umami provisioned stays silent. NEXT_PUBLIC_UMAMI_URL
 * is optional and only needed if Umami is ever moved to a subdomain — by
 * default we load the tracker same-origin from /umami/script.js.
 *
 * Dashboard: /umami
 */
export function Umami() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!websiteId) return null;
  const base = (process.env.NEXT_PUBLIC_UMAMI_URL ?? '/umami').replace(/\/$/, '');
  return (
    <Script
      src={`${base}/script.js`}
      data-website-id={websiteId}
      strategy="afterInteractive"
      defer
    />
  );
}
