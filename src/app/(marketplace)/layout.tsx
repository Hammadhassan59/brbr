import type { Metadata, Viewport } from 'next';
import RegisterServiceWorker from '@/lib/pwa/register-sw';
import { getConsumerSession } from '@/lib/consumer-session';

import { TopBar } from './components/top-bar';
import { MobileBottomNav } from './components/mobile-bottom-nav';

/**
 * Consumer-marketplace shell.
 *
 * This layout nests inside the root `src/app/layout.tsx` (which owns <html>
 * and <body>), so we render children in a plain wrapper only. The root layout
 * already sets a sane <html>/<body>; adding more here would hydrate twice.
 *
 * Structure (per Phase 1 plan at
 * `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`):
 *   - <TopBar /> — sticky, every consumer page.
 *   - <main>{children}</main> — page content.
 *   - <MobileBottomNav /> — mobile-only, `md:hidden`. Account tab target
 *     depends on login state, so we resolve the session once here and pass
 *     `isAuthenticated` down rather than reading the session twice per request.
 *
 * Bottom padding on <main> (`pb-20 md:pb-0`) reserves space so the mobile
 * bottom nav never overlaps the final bit of page content.
 */

export const metadata: Metadata = {
  title: {
    default: 'iCut — Book haircuts & beauty services in Pakistan',
    template: '%s · iCut',
  },
  description:
    'Browse top-rated salons and barbers across Karachi, Lahore, Islamabad, Rawalpindi and Faisalabad. Book at the salon or at home — all in one app.',
  applicationName: 'iCut',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'iCut',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#1A1A1A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default async function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getConsumerSession();

  return (
    <>
      <TopBar />
      <main className="min-h-[calc(100dvh-3.5rem)] pb-20 md:min-h-[calc(100dvh-4rem)] md:pb-0">
        {children}
      </main>
      <MobileBottomNav isAuthenticated={session !== null} />
      <RegisterServiceWorker />
    </>
  );
}
