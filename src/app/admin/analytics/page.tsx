'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils/currency';

const MONTHLY_REVENUE = [
  { month: 'Oct', revenue: 620000 },
  { month: 'Nov', revenue: 780000 },
  { month: 'Dec', revenue: 950000 },
  { month: 'Jan', revenue: 1100000 },
  { month: 'Feb', revenue: 1180000 },
  { month: 'Mar', revenue: 1284500 },
];

const SALON_REVENUE = [
  { name: 'Glamour Studio', revenue: 524000 },
  { name: 'Royal Barbers', revenue: 412000 },
  { name: 'Noor Beauty', revenue: 348500 },
];

const CITY_DIST = [
  { name: 'Lahore', value: 2 },
  { name: 'Karachi', value: 1 },
  { name: 'Islamabad', value: 1 },
];

const COLORS = ['#FEBE10', '#60A5FA', '#4ADE80', '#FB923C'];

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold">Platform Analytics</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Platform revenue trend */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Platform Revenue Growth</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={MONTHLY_REVENUE}>
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
              <BarChart data={SALON_REVENUE}>
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
                <Pie data={CITY_DIST} cx="50%" cy="50%" outerRadius={75} dataKey="value" label>
                  {CITY_DIST.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
            {[
              { label: 'Avg Revenue per Salon', value: formatPKR(428167), change: '+12%' },
              { label: 'Avg Bills per Salon/Day', value: '24', change: '+8%' },
              { label: 'Client Retention Rate', value: '84%', change: '+3%' },
              { label: 'Most Popular Plan', value: 'Growth (Rs 5,000)', change: '' },
              { label: 'Platform MRR', value: formatPKR(12500), change: '+2 salons' },
              { label: 'Churn Rate', value: '0%', change: '' },
            ].map((m) => (
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
