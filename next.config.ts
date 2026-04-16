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
