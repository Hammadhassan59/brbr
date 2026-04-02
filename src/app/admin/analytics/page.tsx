'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils/currency';
import { DEMO_ALL_SALONS } from '@/lib/demo-data';
import type { Salon } from '@/types/database';

const DEMO_MONTHLY_REVENUE = [
  { month: 'Oct', revenue: 620000 },
  { month: 'Nov', revenue: 780000 },
  { month: 'Dec', revenue: 950000 },
  { month: 'Jan', revenue: 1100000 },
  { month: 'Feb', revenue: 1180000 },
  { month: 'Mar', revenue: 1284500 },
];

const DEMO_SALON_REVENUE = [
  { name: 'Glamour Studio', revenue: 524000 },
  { name: 'Royal Barbers', revenue: 412000 },
  { name: 'Noor Beauty', revenue: 348500 },
];

const DEMO_CITY_DIST = [
  { name: 'Lahore', value: 2 },
  { name: 'Karachi', value: 1 },
  { name: 'Islamabad', value: 1 },
];

const DEMO_KEY_METRICS = [
  { label: 'Avg Revenue per Salon', value: formatPKR(428167), change: '+12%' },
  { label: 'Avg Bills per Salon/Day', value: '24', change: '+8%' },
  { label: 'Client Retention Rate', value: '84%', change: '+3%' },
  { label: 'Most Popular Plan', value: 'Growth (Rs 5,000)', change: '' },
  { label: 'Platform MRR', value: formatPKR(12500), change: '+2 salons' },
  { label: 'Churn Rate', value: '0%', change: '' },
];

const COLORS = ['#FEBE10', '#60A5FA', '#4ADE80', '#FB923C'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [monthlyRevenue, setMonthlyRevenue] = useState(DEMO_MONTHLY_REVENUE);
  const [salonRevenue, setSalonRevenue] = useState(DEMO_SALON_REVENUE);
  const [cityDist, setCityDist] = useState(DEMO_CITY_DIST);
  const [keyMetrics, setKeyMetrics] = useState(DEMO_KEY_METRICS);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        // Fetch salons for city distribution and per-salon revenue
        const { data: salonsData } = await supabase
          .from('salons')
          .select('*')
          .order('created_at', { ascending: false });

        const salons: Salon[] = (salonsData && salonsData.length > 0) ? salonsData as Salon[] : DEMO_ALL_SALONS;

        // City distribution
        const cityCounts: Record<string, number> = {};
        salons.forEach((s) => { const city = s.city || 'Unknown'; cityCounts[city] = (cityCounts[city] || 0) + 1; });
        const liveCityDist = Object.entries(cityCounts).map(([name, value]) => ({ name, value }));
        if (liveCityDist.length > 0) setCityDist(liveCityDist);

        // Fetch bills for the last 6 months for trend data
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const { data: billsData } = await supabase
          .from('bills')
          .select('total_amount, salon_id, created_at')
          .gte('created_at', sixMonthsAgo.toISOString())
          .order('created_at', { ascending: true });

        if (billsData && billsData.length > 0) {
          // Monthly revenue aggregation
          const monthlyMap: Record<string, number> = {};
          const salonRevenueMap: Record<string, number> = {};

          billsData.forEach((b: { total_amount: number; salon_id: string; created_at: string }) => {
            const d = new Date(b.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap[key] = (monthlyMap[key] || 0) + (b.total_amount || 0);
            salonRevenueMap[b.salon_id] = (salonRevenueMap[b.salon_id] || 0) + (b.total_amount || 0);
          });

          // Convert to chart data, sorted by month
          const monthlyArr = Object.entries(monthlyMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, revenue]) => ({
              month: MONTH_NAMES[parseInt(key.split('-')[1]) - 1],
              revenue,
            }));
          if (monthlyArr.length > 0) setMonthlyRevenue(monthlyArr);

          // Per-salon revenue (current month)
          const now = new Date();
          const currentMonthBills = billsData.filter((b: { created_at: string }) => {
            const d = new Date(b.created_at);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });
          const currentSalonMap: Record<string, number> = {};
          currentMonthBills.forEach((b: { total_amount: number; salon_id: string }) => {
            currentSalonMap[b.salon_id] = (currentSalonMap[b.salon_id] || 0) + (b.total_amount || 0);
          });
          const salonNameMap: Record<string, string> = {};
          salons.forEach((s) => { salonNameMap[s.id] = s.name; });
          const salonRevenueArr = Object.entries(currentSalonMap)
            .map(([id, revenue]) => ({ name: salonNameMap[id] || id.slice(0, 8), revenue }))
            .sort((a, b) => b.revenue - a.revenue);
          if (salonRevenueArr.length > 0) setSalonRevenue(salonRevenueArr);

          // Key metrics from real data
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
            { label: 'Most Popular Plan', value: 'Growth (Rs 5,000)', change: '' },
            { label: 'Platform MRR', value: formatPKR(salonCount * 5000), change: `${salonCount} salons` },
            { label: 'Churn Rate', value: '0%', change: '' },
          ]);
        }
      } catch {
        setMonthlyRevenue(DEMO_MONTHLY_REVENUE);
        setSalonRevenue(DEMO_SALON_REVENUE);
        setCityDist(DEMO_CITY_DIST);
        setKeyMetrics(DEMO_KEY_METRICS);
        toast.error('Could not load live data — showing demo');
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Platform revenue trend */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Platform Revenue Growth</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 100000).toFixed(1)}L`} />
                <Tooltip formatter={(v) => formatPKR(Number(v))} />
                <Line type="monotone" dataKey="revenue" stroke="#FEBE10" strokeWidth={2.5} dot={{ fill: '#FEBE10' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue per salon */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Salon (This Month)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={salonRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => formatPKR(Number(v))} />
                <Bar dataKey="revenue" fill="#FEBE10" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* City distribution */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Salons by City</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={cityDist} cx="50%" cy="50%" outerRadius={75} dataKey="value" label>
                  {cityDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
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
