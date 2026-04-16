import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    viewTransition: true,
  },
  // pdfkit ships .afm font files (Helvetica, Times, etc.) that it loads at
  // runtime via fs.readFileSync. Next.js's standalone output trace can't see
  // those reads, so the files don't get copied into /ROOT/node_modules/pdfkit
  // and the data-export route crashes with ENOENT. Force-include them here.
  outputFileTracingIncludes: {
    '/api/dashboard/data-export.pdf': [
      './node_modules/pdfkit/js/data/**/*',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://s.icut.pk wss://s.icut.pk https://icut.pk wss://icut.pk",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
