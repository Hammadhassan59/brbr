'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Plus, Loader2, Settings, Search, LayoutGrid, List } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { getAdminSalons, impersonateSalon } from '@/app/actions/admin';
import { formatPKDate } from '@/lib/utils/dates';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Salon, Branch } from '@/types/database';

type ViewMode = 'card' | 'list';

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  gents: { label: 'Gents', cls: 'bg-blue-500/15 text-blue-600' },
  ladies: { label: 'Ladies', cls: 'bg-pink-500/15 text-pink-600' },
  unisex: { label: 'Unisex', cls: 'bg-purple-500/15 text-purple-600' },
};

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-600 border-green-500/25 bg-green-500/10',
  pending: 'text-amber-600 border-amber-500/25 bg-amber-500/10',
  expired: 'text-red-600 border-red-500/25 bg-red-500/10',
  suspended: 'text-gray-500 border-gray-400/25 bg-gray-500/10',
};

export default function AdminSalonsPage() {
  const router = useRouter();
  const { setSalon, setBranches, setCurrentBranch, setIsOwner, setIsPartner, setIsSuperAdmin, setCurrentStaff, setCurrentPartner } = useAppStore();

  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [enteringName, setEnteringName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('icut-admin-salons-view') as ViewMode) || 'card';
    return 'card';
  });

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

  const filtered = useMemo(() => {
    if (!search) return salons;
    const q = search.toLowerCase();
    return salons.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    );
  }, [salons, search]);

  async function enterSalon(salon: Salon) {
    // Show an overlay immediately so the click-to-navigation gap doesn't look
    // like the app went offline. The overlay stays up through the hard nav.
    setEnteringName(salon.name);
    const { data, error } = await impersonateSalon(salon.id);
    if (error || !data) {
      setEnteringName(null);
      toast.error(error || 'Could not log in as this salon');
      return;
    }
    // Redeem the owner's magic-link token so the browser's Supabase client
    // carries the owner's auth.uid(). RLS policies on salon-scoped tables
    // (via get_user_salon_id()) silently return zero rows without this.
    const { error: otpErr } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: data.supabaseAuth.tokenHash,
    });
    if (otpErr) {
      setEnteringName(null);
      toast.error('Could not establish salon session: ' + otpErr.message);
      return;
    }
    // impersonateSalon() already signed a new icut-token JWT server-side
    // with role=owner. The proxy verifies that on the next navigation; we
    // no longer mirror forgeable icut-session / icut-role cookies here.
    // Mirror a normal owner login into Zustand so every {isOwner && ...} gate opens.
    setSalon(data.salon as unknown as Salon);
    setBranches((data.branches as unknown) as Branch[]);
    setCurrentBranch(data.mainBranch as unknown as Branch);
    setIsOwner(true);
    setIsPartner(false);
    setIsSuperAdmin(false);
    setCurrentStaff(null);
    setCurrentPartner(null);
    window.location.href = '/dashboard';
  }

  function toggleView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('icut-admin-salons-view', mode);
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
      {enteringName && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
          <p className="text-sm font-medium text-foreground">Logging in as <span className="text-gold">{enteringName}</span>…</p>
          <p className="text-xs text-muted-foreground">Loading salon dashboard</p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">All Salons ({salons.length})</h2>
        <Button size="sm" className="bg-gold text-black border border-gold" onClick={() => toast('Salon creation coming soon — salons self-register via /setup')}><Plus className="w-4 h-4 mr-1" /> Add Salon</Button>
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search salon name, city, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleView('card')}
            className={`p-2 transition-all duration-150 ${viewMode === 'card' ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'}`}
            title="Card view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleView('list')}
            className={`p-2 transition-all duration-150 ${viewMode === 'list' ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {search && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Showing {filtered.length} of {salons.length} salons</p>
          <button onClick={() => setSearch('')} className="text-xs text-gold hover:underline">Clear</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {salons.length === 0 ? 'No salons yet.' : 'No salons match your search.'}
        </p>
      ) : viewMode === 'card' ? (
        /* ── Card View ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((salon) => {
            const type = TYPE_BADGE[salon.type] || TYPE_BADGE.unisex;
            const sub = salon.subscription_status || 'pending';
            return (
              <Card key={salon.id} className="hover:border-gold/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg bg-gold/10 text-gold font-bold flex items-center justify-center text-sm shrink-0">
                      {salon.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-semibold truncate">{salon.name}</p>
                      <p className="text-xs text-muted-foreground">{salon.city} {salon.phone ? `· ${salon.phone}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className={`text-[10px] ${type.cls}`}>{type.label}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[sub] || STATUS_COLORS.pending}`}>
                      {sub.charAt(0).toUpperCase() + sub.slice(1)}
                    </Badge>
                    {salon.subscription_plan && salon.subscription_plan !== 'none' && (
                      <Badge variant="outline" className="text-[10px] text-gold border-gold/25 bg-gold/10">
                        {salon.subscription_plan.charAt(0).toUpperCase() + salon.subscription_plan.slice(1)}
                      </Badge>
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
                    <Button size="sm" className="flex-1 text-xs gap-1 bg-gold text-black border border-gold hover:bg-gold/90" onClick={() => enterSalon(salon)} disabled={!!enteringName}>
                      <LogIn className="w-3 h-3" /> Login as Salon
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── List View ── */
        <Card>
          <CardContent className="px-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Salon</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((salon) => {
                  const type = TYPE_BADGE[salon.type] || TYPE_BADGE.unisex;
                  const sub = salon.subscription_status || 'pending';
                  const plan = salon.subscription_plan || 'pending';
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
                        <Badge variant="outline" className="text-[10px] text-gold border-gold/25 bg-gold/10">
                          {plan.charAt(0).toUpperCase() + plan.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[sub] || STATUS_COLORS.pending}`}>
                          {sub.charAt(0).toUpperCase() + sub.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatPKDate(salon.created_at)}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push(`/admin/salons/${salon.id}`)}>
                            <Settings className="w-3 h-3" /> Manage
                          </Button>
                          <Button size="sm" className="h-7 text-xs gap-1 bg-gold text-black border border-gold hover:bg-gold/90" onClick={() => enterSalon(salon)} disabled={!!enteringName}>
                            <LogIn className="w-3 h-3" /> Login
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
      )}
    </div>
  );
}
