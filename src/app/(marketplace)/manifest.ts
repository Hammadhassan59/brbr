import type { MetadataRoute } from 'next';

/**
 * Consumer-marketplace web app manifest.
 *
 * Brand colors mirror the owner dashboard (`public/manifest.json` +
 * `src/app/layout.tsx` themeColor): `#1A1A1A` foreground / `#F2F2F2` neutral
 * background. Keeping them aligned across both PWAs gives the same
 * splash/status-bar look whether the user installs the marketplace or the
 * owner app.
 *
 * Icons are placeholders in `public/icons/` — replace with real branded assets
 * before prod (see `public/icons/README.md`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'iCut',
    short_name: 'iCut',
    description: 'Book haircuts & beauty services in Pakistan',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F2F2F2',
    theme_color: '#1A1A1A',
    categories: ['lifestyle', 'shopping'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
