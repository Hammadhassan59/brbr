'use client';

import { useEffect } from 'react';

/**
 * Mount-only client component that registers the marketplace service worker.
 * - Skips in dev (Next dev HMR + SW caching fight each other).
 * - Guards against SSR and browsers without serviceWorker support.
 * - No push subscription here — Phase 1 uses email, not Web Push.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
      } catch (err) {
        // Non-fatal: PWA install flow still works; offline shell just won't cache.
         
        console.warn('[pwa] service worker registration failed', err);
      }
    };

    // Defer until after first paint so it never competes with hydration.
    if (document.readyState === 'complete') {
      void register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
