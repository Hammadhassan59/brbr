import Link from 'next/link';
import { Activity, ExternalLink, Eye, Globe, MapPin, Smartphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DASHBOARD_PATH = '/umami';

export default function VisitorsPage() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const configured = !!websiteId;

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="font-heading text-xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#FEBE10]" /> Website Visitors
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Self-hosted analytics via Umami, served same-origin at <span className="font-mono text-xs">icut.pk/umami</span>. Data never leaves your VPS.
        </p>
      </div>

      {configured ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Tracking active
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              href={DASHBOARD_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FEBE10] text-black text-sm font-medium hover:bg-[#e5aa0e] transition-colors"
            >
              Open Umami Dashboard <ExternalLink className="w-4 h-4" />
            </a>
            <p className="text-xs text-muted-foreground">
              Sign in with the admin credentials you set during first-time setup.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Setup required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Umami ships in docker-compose. No DNS change needed — it runs under <span className="font-mono">icut.pk/umami</span>.
            </p>

            <div>
              <p className="font-medium mb-1">1. Server env — add 3 values to <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">/opt/brbr/.env.local</span></p>
              <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
{`# Server-only — Umami container creds:
UMAMI_DB_PASSWORD=<openssl rand -hex 24>
UMAMI_APP_SECRET=<openssl rand -hex 32>

# Public — filled in after step 3:
NEXT_PUBLIC_UMAMI_WEBSITE_ID=`}
              </pre>
            </div>

            <div>
              <p className="font-medium mb-1">2. Deploy & start the new containers</p>
              <p className="text-muted-foreground text-xs">
                Push to main. The deploy workflow runs <span className="font-mono">docker compose up -d</span> and starts <span className="font-mono">umami</span> + <span className="font-mono">umami-db</span>.
              </p>
            </div>

            <div>
              <p className="font-medium mb-1">3. First-time Umami login</p>
              <p className="text-muted-foreground text-xs">
                Visit <span className="font-mono">https://icut.pk/umami</span>. Default creds are <span className="font-mono">admin</span> / <span className="font-mono">umami</span> — Umami forces a password change on first login. Then <strong>Settings → Websites → Add Website</strong>, name it <em>iCut</em>, domain <span className="font-mono">icut.pk</span>. Copy the <strong>Website ID</strong>, paste into <span className="font-mono">NEXT_PUBLIC_UMAMI_WEBSITE_ID</span>, redeploy.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Pageviews start appearing on the dashboard in real time after step 3.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">What Umami tracks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Feature icon={Eye} title="Pageviews & visitors" body="Unique visitors, total views, top pages, entry & exit pages, bounce rate, avg session duration." />
            <Feature icon={Globe} title="Referrers & campaigns" body="Where traffic comes from — Google, WhatsApp, Instagram, direct — and which campaigns convert." />
            <Feature icon={MapPin} title="Country & city" body="Geo breakdown by country and city (GeoIP), useful for localization decisions." />
            <Feature icon={Smartphone} title="Device & browser" body="Mobile vs desktop, OS, browser, screen size — to prioritize where the UX matters." />
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Note: Umami does <strong>not</strong> capture scroll depth or session recordings. If you later want those, we can layer OpenReplay on top.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link href="/admin/analytics" className="underline hover:text-foreground">
          Business metrics (MRR, salons, revenue) are in Analytics →
        </Link>
      </p>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
        <Icon className="w-4 h-4 text-[#FEBE10]" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}
