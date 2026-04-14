'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Plus, Loader2, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { getAdminSalons, getAdminBranchForSalon } from '@/app/actions/admin';
import { formatPKDate } from '@/lib/utils/dates';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Salon, Branch } from '@/types/database';

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  gents: { label: 'Gents', cls: 'bg-blue-500/15 text-blue-600' },
  ladies: { label: 'Ladies', cls: 'bg-pink-500/15 text-pink-600' },
  unisex: { label: 'Unisex', cls: 'bg-purple-500/15 text-purple-600' },
};

export default function AdminSalonsPage() {
  const router = useRouter();
  const { setSalon, setCurrentBranch } = useAppStore();

  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSalons() {
      try {
        const data = await getAdminSalons();
        setSalons(data as Salon[]);
      } catch {
        toast.error('Could not load salons');
      } finally {
        setLoading(false);
      }
    }
    fetchSalons();
  }, []);

  async function enterSalon(salon: Salon) {
    setSalon(salon);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">All Salons</h2>
        <Button size="sm" className="bg-gold text-black border border-gold" onClick={() => toast('Salon creation coming soon — salons self-register via /setup')}><Plus className="w-4 h-4 mr-1" /> Add Salon</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {salons.map((salon) => {
          const type = TYPE_BADGE[salon.type] || TYPE_BADGE.unisex;
          return (
            <Card key={salon.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-gold/10 text-gold font-bold flex items-center justify-center text-sm shrink-0">
                    {salon.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold truncate">{salon.name}</p>
                    <p className="text-xs text-muted-foreground">{salon.city} · {salon.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className={`text-[10px] ${type.cls}`}>{type.label}</Badge>
                  {salon.setup_complete ? (
                    <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25 bg-green-500/10">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-500/25 bg-orange-500/10">Pending</Badge>
                  )}
                  {salon.gst_enabled && <Badge variant="outline" className="text-[10px]">GST</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground mb-3">
                  {salon.address} · Joined {formatPKDate(salon.created_at)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => router.push(`/admin/salons/${salon.id}`)}>
                    <Settings className="w-3 h-3" /> Manage
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => enterSalon(salon)}>
                    <Eye className="w-3 h-3" /> Enter
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
