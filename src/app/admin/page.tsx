'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Store, Users, TrendingUp, DollarSign, AlertTriangle,
  CheckCircle, Clock, Eye, Scissors, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { formatPKRShort } from '@/lib/utils/currency';
import { getAdminDashboardData, getAdminBranchForSalon } from '@/app/actions/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Salon, Branch } from '@/types/database';

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  gents: { label: 'Gents', cls: 'bg-blue-500/15 text-blue-600' },
  ladies: { label: 'Ladies', cls: 'bg-pink-500/15 text-pink-600' },
  unisex: { label: 'Unisex', cls: 'bg-purple-500/15 text-purple-600' },
};

export default function AdminDashboard() {
  const router = useRouter();
  const { setSalon, setCurrentBranch, setCurrentStaff, setIsSuperAdmin } = useAppStore();

  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState({
    totalSalons: 0,
    activeSalons: 0,
    pendingSetup: 0,
    totalStaff: 0,
    totalClients: 0,
    monthlyRevenue: 0,
    monthlyBills: 0,
    trialSalons: 0,
    paidSalons: 0,
    churnedSalons: 0,
    topCity: '—',
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const { salons: salonData, stats } = await getAdminDashboardData();
        setSalons(salonData as Salon[]);
        setPlatformStats(stats);
      } catch {
        toast.error('Could not load platform data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function enterSalon(salon: Salon) {
    setSalon(salon);
    setCurrentStaff(null);
    try {
      const branch = await getAdminBranchForSalon(salon.id);
      if (branch) setCurrentBranch(branch as Branch);
    } catch {
      // Branch will be loaded by dashboard
    }
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
            <p className="text-xs text-amber-600">Pending</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/20 bg-orange-500/10">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 text-orange-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-orange-600">{platformStats.churnedSalons}</p>
            <p className="text-xs text-orange-600">Expired / Suspended</p>
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
                const subStatus = salon.subscription_status as string | undefined;
                const STATUS_BADGE: Record<string, string> = {
                  active: 'text-green-600 border-green-500/25 bg-green-500/10',
                  pending: 'text-amber-600 border-amber-500/25 bg-amber-500/10',
                  expired: 'text-red-600 border-red-500/25 bg-red-500/10',
                  suspended: 'text-gray-500 border-gray-400/25 bg-gray-500/10',
                };
                const statusCls = STATUS_BADGE[subStatus ?? ''] || 'text-gray-500 border-gray-400/25 bg-gray-500/10';
                const statusLabel = subStatus
                  ? subStatus.charAt(0).toUpperCase() + subStatus.slice(1)
                  : 'Unknown';
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
                      <Badge variant="outline" className={`text-[10px] ${statusCls}`}>{statusLabel}</Badge>
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
          <p className="text-sm text-muted-foreground py-4 text-center">Activity feed will appear as salons sign up and transact.</p>
        </CardContent>
      </Card>
    </div>
  );
}
