'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- pg-adapter typing leaves
   data as `any`, so map/filter callbacks need explicit `: any` annotations
   to satisfy noImplicitAny. Re-enabling the rule once Phase 2 finishes and
   types tighten. */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, UserCog, Building2, Trophy } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { getAdminAnalytics } from '@/app/actions/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils/currency';

type SalesStats = Awaited<ReturnType<typeof getAdminAnalytics>>['agentStats'];
type AgencyStats = Awaited<ReturnType<typeof getAdminAnalytics>>['agencyStats'];

const COLORS = ['#FEBE10', '#60A5FA', '#4ADE80', '#FB923C'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [monthlyRevenue, setMonthlyRevenue] = useState<{ month: string; revenue: number }[]>([]);
  const [salonRevenue, setSalonRevenue] = useState<{ name: string; revenue: number }[]>([]);
  const [cityDist, setCityDist] = useState<{ name: string; value: number }[]>([]);
  const [keyMetrics, setKeyMetrics] = useState<{ label: string; value: string; change: string }[]>([]);
  const [subscriptionMrr, setSubscriptionMrr] = useState(0);
  const [activeSubscribers, setActiveSubscribers] = useState(0);
  const [mrrByPlan, setMrrByPlan] = useState<Record<string, { count: number; revenue: number }>>({});
  const [agentStats, setAgentStats] = useState<SalesStats | null>(null);
  const [agencyStats, setAgencyStats] = useState<AgencyStats | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const { salons, cityDist: liveCityDist, bills, salonNameMap, subscriptionMrr: mrr, activeSubscribers: subs, mrrByPlan: byPlan, agentStats: ag, agencyStats: agc } = await getAdminAnalytics();
        setSubscriptionMrr(mrr ?? 0);
        setActiveSubscribers(subs ?? 0);
        setMrrByPlan(byPlan ?? {});
        setAgentStats(ag);
        setAgencyStats(agc);

        setCityDist(liveCityDist);

        if (bills.length > 0) {
          // Monthly revenue aggregation
          const monthlyMap: Record<string, number> = {};
          bills.forEach((b: { total_amount: number; salon_id: string; created_at: string }) => {
            const d = new Date(b.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap[key] = (monthlyMap[key] || 0) + (b.total_amount || 0);
          });

          const monthlyArr = Object.entries(monthlyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, revenue]) => ({
              month: MONTH_NAMES[parseInt(key.split('-')[1]) - 1],
              revenue,
            }));
          setMonthlyRevenue(monthlyArr);

          // Per-salon revenue (current month)
          const now = new Date();
          const currentMonthBills = bills.filter((b: { created_at: string }) => {
            const d = new Date(b.created_at);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });
          const currentSalonMap: Record<string, number> = {};
          currentMonthBills.forEach((b: { total_amount: number; salon_id: string }) => {
            currentSalonMap[b.salon_id] = (currentSalonMap[b.salon_id] || 0) + (b.total_amount || 0);
          });
          const salonRevenueArr = Object.entries(currentSalonMap)
            .map(([id, revenue]) => ({ name: salonNameMap[id] || id.slice(0, 8), revenue }))
            .sort((a, b) => b.revenue - a.revenue);
          setSalonRevenue(salonRevenueArr);

          // Key metrics
          const totalRevenue = Object.values(currentSalonMap).reduce((s, v) => s + v, 0);
          const salonCount = salons.length || 1;
          const avgRevenue = Math.round(totalRevenue / salonCount);
          const totalBills = currentMonthBills.length;
          const daysInMonth = now.getDate();
          const avgBillsPerDay = daysInMonth > 0 ? Math.round(totalBills / daysInMonth / salonCount) : 0;

          setKeyMetrics([
            { label: 'Avg Revenue per Salon', value: formatPKR(avgRevenue), change: '' },
            { label: 'Avg Bills per Salon/Day', value: String(avgBillsPerDay), change: '' },
            { label: 'Client Retention Rate', value: '—', change: '' },
            { label: 'Total Salons', value: String(salonCount), change: '' },
            { label: 'Total Bills This Month', value: String(totalBills), change: '' },
            { label: 'Total Revenue This Month', value: formatPKR(totalRevenue), change: '' },
          ]);
        }
      } catch {
        toast.error('Could not load analytics data');
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold">Platform Analytics</h2>

      {/* Sales agents + agency funnel */}
      {agentStats && agencyStats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCog className="w-4 h-4 text-purple-600" /> Sales agents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Mini label="Active" value={String(agentStats.active)} sub={`${agentStats.total} total`} />
                <Mini label="Platform-direct" value={String(agentStats.platformDirect)} sub="not agency-owned" />
                <Mini label="Via agencies" value={String(agentStats.agencyOwned)} sub="agency-owned" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Mini label="Commission earned" value={formatPKR(agentStats.commissionEarned)} sub="approved + paid" />
                <Mini label="Commission paid out" value={formatPKR(agentStats.commissionPaid)} sub={`${agentStats.salonsOnboarded} salons onboarded`} />
              </div>
              {agentStats.topPerformers.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Top performers
                  </p>
                  <ul className="space-y-1">
                    {agentStats.topPerformers.slice(0, 3).map((a: any) => (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <Link href={`/admin/agents/${a.id}`} className="hover:underline">{a.name} <span className="text-[11px] text-muted-foreground font-mono">{a.code}</span></Link>
                        <span className="font-medium">{formatPKR(a.earned)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-600" /> Agencies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Mini label="Active" value={String(agencyStats.active)} sub={`${agencyStats.total} total`} />
                <Mini label="Frozen" value={String(agencyStats.frozen)} sub="liability breach" />
                <Mini label="Terminated" value={String(agencyStats.terminated)} sub="all-time" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Mini label="Commission earned" value={formatPKR(agencyStats.commissionEarned)} sub="approved + paid" />
                <Mini label="Commission paid out" value={formatPKR(agencyStats.commissionPaid)} sub={`${agencyStats.salonsByAgencies} salons via agencies`} />
              </div>
              {agencyStats.topPerformers.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Top performers
                  </p>
                  <ul className="space-y-1">
                    {agencyStats.topPerformers.slice(0, 3).map((a: any) => (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <Link href={`/admin/agencies/${a.id}`} className="hover:underline">{a.name} <span className="text-[11px] text-muted-foreground font-mono">{a.code}</span></Link>
                        <span className="font-medium">{formatPKR(a.earned)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Super admin subscription revenue (MRR) — separate from platform gross */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Your Subscription MRR</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold break-words">{formatPKR(subscriptionMrr)}</p>
            <p className="text-xs text-muted-foreground mt-1">Recurring monthly revenue from active salons</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Subscribers</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold">{activeSubscribers}</p>
            <p className="text-xs text-muted-foreground mt-1">Salons on a paid plan</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">By Plan</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(mrrByPlan).length === 0 ? (
              <p className="text-sm text-muted-foreground">No active subscribers yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {Object.entries(mrrByPlan).map(([plan, b]) => (
                  <li key={plan} className="flex justify-between">
                    <span className="capitalize">{plan}</span>
                    <span className="font-medium">{b.count} × {formatPKR(b.count > 0 ? b.revenue / b.count : 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Platform revenue trend */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Platform Revenue Growth</CardTitle></CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyRevenue} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => `${(v / 100000).toFixed(1)}L`} />
                  <Tooltip formatter={(v) => formatPKR(Number(v))} />
                  <Line type="monotone" dataKey="revenue" stroke="#FEBE10" strokeWidth={2.5} dot={{ fill: '#FEBE10' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue per salon */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Salon (This Month)</CardTitle></CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salonRevenue} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => formatPKR(Number(v))} />
                  <Bar dataKey="revenue" fill="#FEBE10" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* City distribution */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Salons by City</CardTitle></CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cityDist} cx="50%" cy="50%" outerRadius="70%" dataKey="value" label={{ fontSize: 10 }}>
                    {cityDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Key metrics */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Key Metrics</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {keyMetrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{m.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.value}</span>
                  {m.change && <span className="text-[10px] text-green-600">{m.change}</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
