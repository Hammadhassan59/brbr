import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    viewTransition: true,
  },
  // pdfkit reads .afm font files at runtime via fs.readFileSync (Helvetica,
  // Courier, Times). Two layers of fix needed:
  //  1. serverExternalPackages: stop Turbopack from bundling pdfkit into a
  //     chunk that hardcodes paths like /ROOT/node_modules/pdfkit/js/data/...
  //     which then never resolve. Keeping it external means Node's normal
  //     `require('pdfkit')` resolves to /app/node_modules/pdfkit at runtime.
  //  2. outputFileTracingIncludes: explicitly pull pdfkit's data folder
  //     into the standalone trace so it's actually present in /app/node_modules.
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/dashboard/data-export.pdf': [
      './node_modules/pdfkit/js/data/**/*',
      './node_modules/fontkit/**/*',
    ],
  },
  async headers() {
    // CSP notes:
    // - `'unsafe-eval'` removed. Next 16 + Turbopack should not require it at
    //   runtime in production; if a third-party lib breaks, audit and replace
    //   rather than re-add.
    // - `'unsafe-inline'` is still present for script-src/style-src. A full
    //   nonce-based CSP (the ideal) requires proxy.ts to generate a per-request
    //   nonce, forward it via the `x-nonce` request header, and for every
    //   `<script>` / `<style>` tag to consume it. That's a larger refactor —
    //   TODO follow-up: nonce-based CSP via proxy.ts, matcher: '/(.*)'.
    // - `connect-src` pruned: dropped `wss://icut.pk` and `wss://s.icut.pk`
    //   (the app does not open websockets to its own origin). Supabase
    //   realtime websockets still allowed via `wss://*.supabase.co`.
    // - HSTS is set at the Caddy edge (see Caddyfile), not here.
    // - COOP + CORP harden against cross-origin leaks.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
