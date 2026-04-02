'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Store, Users, TrendingUp, DollarSign, AlertTriangle,
  CheckCircle, Clock, Eye, Scissors, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKRShort } from '@/lib/utils/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DEMO_ALL_SALONS, DEMO_BRANCH } from '@/lib/demo-data';
import type { Salon } from '@/types/database';

// Fallback platform-level stats (demo mode)
const DEMO_PLATFORM_STATS = {
  totalSalons: 4,
  activeSalons: 3,
  pendingSetup: 1,
  totalStaff: 23,
  totalClients: 847,
  monthlyRevenue: 1284500,
  monthlyBills: 2134,
  trialSalons: 1,
  paidSalons: 2,
  churnedSalons: 0,
  topCity: 'Lahore',
};

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  gents: { label: 'Gents', cls: 'bg-blue-500/15 text-blue-600' },
  ladies: { label: 'Ladies', cls: 'bg-pink-500/15 text-pink-600' },
  unisex: { label: 'Unisex', cls: 'bg-purple-500/15 text-purple-600' },
};

export default function AdminDashboard() {
  const router = useRouter();
  const { setSalon, setCurrentBranch, setCurrentStaff, setIsSuperAdmin } = useAppStore();

  const [salons, setSalons] = useState<Salon[]>(DEMO_ALL_SALONS);
  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState(DEMO_PLATFORM_STATS);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch salons
        const { data: salonData, error: salonErr } = await supabase
          .from('salons')
          .select('*')
          .order('created_at', { ascending: false });

        if (salonErr) throw salonErr;

        const liveSalons = (salonData && salonData.length > 0) ? salonData as Salon[] : DEMO_ALL_SALONS;
        setSalons(liveSalons);

        // Calculate stats from real data
        const activeSalons = liveSalons.filter((s) => s.setup_complete).length;
        const pendingSetup = liveSalons.length - activeSalons;

        // Fetch monthly revenue from bills
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const { data: billData } = await supabase
          .from('bills')
          .select('total_amount')
          .gte('created_at', monthStart.toISOString());

        const monthlyRevenue = billData && billData.length > 0
          ? billData.reduce((sum: number, b: { total_amount: number }) => sum + (b.total_amount || 0), 0)
          : DEMO_PLATFORM_STATS.monthlyRevenue;
        const monthlyBills = billData && billData.length > 0 ? billData.length : DEMO_PLATFORM_STATS.monthlyBills;

        // Fetch staff count
        const { count: staffCount } = await supabase
          .from('staff')
          .select('*', { count: 'exact', head: true });

        // Fetch client count
        const { count: clientCount } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true });

        // Find top city
        const cityCounts: Record<string, number> = {};
        liveSalons.forEach((s) => { const city = s.city || 'Unknown'; cityCounts[city] = (cityCounts[city] || 0) + 1; });
        const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || DEMO_PLATFORM_STATS.topCity;

        setPlatformStats({
          totalSalons: liveSalons.length,
          activeSalons,
          pendingSetup,
          totalStaff: staffCount ?? DEMO_PLATFORM_STATS.totalStaff,
          totalClients: clientCount ?? DEMO_PLATFORM_STATS.totalClients,
          monthlyRevenue,
          monthlyBills,
          trialSalons: pendingSetup, // approximate: pending ~ trial
          paidSalons: activeSalons,
          churnedSalons: 0,
          topCity,
        });
      } catch {
        setSalons(DEMO_ALL_SALONS);
        setPlatformStats(DEMO_PLATFORM_STATS);
        toast.error('Could not load live data — showing demo');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function enterSalon(salon: Salon) {
    setSalon(salon);
    setCurrentBranch(DEMO_BRANCH); // In real app, fetch the salon's main branch
    setCurrentStaff(null);
    router.push('/dashboard');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Salons', value: String(platformStats.totalSalons), sub: `${platformStats.activeSalons} active`, icon: Store, color: 'text-blue-600', bg: 'bg-blue-500/10' },
          { label: 'Platform Revenue', value: formatPKRShort(platformStats.monthlyRevenue), sub: `${platformStats.monthlyBills} bills this month`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-500/10' },
          { label: 'Total Clients', value: String(platformStats.totalClients), sub: 'Across all salons', icon: Users, color: 'text-purple-600', bg: 'bg-purple-500/10' },
          { label: 'Total Staff', value: String(platformStats.totalStaff), sub: `Top city: ${platformStats.topCity}`, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-500/10' },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <c.icon className={`w-4 h-4 ${c.color}`} />
                </div>
              </div>
              <p className="text-2xl font-heading font-bold">{c.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscription overview */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-green-500/20 bg-green-500/10">
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-600">{platformStats.paidSalons}</p>
            <p className="text-xs text-green-600">Paid Subscriptions</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/10">
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 text-amber-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-600">{platformStats.trialSalons}</p>
            <p className="text-xs text-amber-600">On Trial</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20 bg-orange-500/10">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 text-orange-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-orange-600">{platformStats.pendingSetup}</p>
            <p className="text-xs text-orange-600">Pending Setup</p>
          </CardContent>
        </Card>
      </div>

      {/* All Salons Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Store className="w-4 h-4" /> All Salons ({salons.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Salon</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Revenue (est.)</TableHead>
                <TableHead className="text-center pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salons.map((salon) => {
                const type = TYPE_BADGE[salon.type] || TYPE_BADGE.unisex;
                const isComplete = salon.setup_complete;
                return (
                  <TableRow key={salon.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gold/10 text-gold font-bold text-xs flex items-center justify-center shrink-0">
                          {salon.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{salon.name}</p>
                          <p className="text-[10px] text-muted-foreground">{salon.phone}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{salon.city}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] ${type.cls}`}>{type.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {isComplete ? (
                        <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25 bg-green-500/10">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-500/25 bg-orange-500/10">Setup Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span>—</span>
                      <Link href="/admin/analytics" className="block text-[10px] text-muted-foreground hover:text-foreground">(see Analytics)</Link>
                    </TableCell>
                    <TableCell className="text-center pr-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => enterSalon(salon)}
                        >
                          <Eye className="w-3 h-3" /> View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Platform Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { time: '2 min ago', event: 'New salon registered', detail: 'Style Hub — Rawalpindi', color: 'text-blue-600' },
              { time: '15 min ago', event: 'Subscription payment received', detail: 'Royal Barbers — Rs 5,000 (Growth Plan)', color: 'text-green-600' },
              { time: '1 hour ago', event: 'Salon completed setup', detail: 'Noor Beauty Lounge — Karachi', color: 'text-purple-600' },
              { time: '3 hours ago', event: 'Trial expiring soon', detail: 'Style Hub — 3 days remaining', color: 'text-amber-600' },
              { time: 'Yesterday', event: 'New subscription', detail: 'Glamour Studio upgraded to Growth Plan', color: 'text-green-600' },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-[10px] text-muted-foreground w-16 shrink-0 pt-0.5">{a.time}</span>
                <div>
                  <p className={`font-medium ${a.color}`}>{a.event}</p>
                  <p className="text-xs text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
