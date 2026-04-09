'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Plus, Download, Tag, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientCard } from './components/client-card';
import type { Client } from '@/types/database';

type FilterTab = 'all' | 'vip' | 'regular' | 'lapsed' | 'udhaar' | 'blacklisted';
type SortBy = 'name' | 'total_spent' | 'total_visits' | 'udhaar_balance' | 'loyalty_points';

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsContent />
    </Suspense>
  );
}

function ClientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { salon } = useAppStore();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>((searchParams.get('tab') as FilterTab) || 'all');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchClients = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('salon_id', salon.id)
        .order('name');
      if (error) throw error;
      setClients((data || []) as Client[]);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [salon]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filtered = clients.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !(c.phone || '').includes(q)) return false;
    }
    switch (tab) {
      case 'vip': return c.is_vip;
      case 'regular': return !c.is_vip && !c.is_blacklisted && c.total_visits > 0;
      case 'lapsed': {
        const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
        const daysSinceCreated = new Date().getTime() - new Date(c.created_at).getTime();
        return c.total_visits > 0 && !c.is_blacklisted && daysSinceCreated > sixtyDaysMs;
      }
      case 'udhaar': return c.udhaar_balance > 0;
      case 'blacklisted': return c.is_blacklisted;
      default: return true;
    }
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'total_spent': return b.total_spent - a.total_spent;
      case 'total_visits': return b.total_visits - a.total_visits;
      case 'udhaar_balance': return b.udhaar_balance - a.udhaar_balance;
      case 'loyalty_points': return b.loyalty_points - a.loyalty_points;
      default: return a.name.localeCompare(b.name);
    }
  });

  function toggleSelect(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    setSelectedIds(next);
  }

  function exportCSV() {
    const rows = [['Name', 'Phone', 'Gender', 'Visits', 'Spent', 'Udhaar', 'Points']];
    const data = selectedIds.size > 0 ? sorted.filter((c) => selectedIds.has(c.id)) : sorted;
    data.forEach((c) => {
      rows.push([c.name, c.phone || '', c.gender || '', String(c.total_visits), String(c.total_spent), String(c.udhaar_balance), String(c.loyalty_points)]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brbr-clients.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { value: FilterTab; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: clients.length },
    { value: 'vip', label: 'VIP', count: clients.filter((c) => c.is_vip).length },
    { value: 'regular', label: 'Regular' },
    { value: 'udhaar', label: 'Udhaar', count: clients.filter((c) => c.udhaar_balance > 0).length },
    { value: 'blacklisted', label: 'Blacklisted' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="pl-10 h-11"
          />
        </div>

        <Select value={sortBy} onValueChange={(v) => { if (v) setSortBy(v as SortBy); }}>
          <SelectTrigger className="w-[150px] h-11">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="total_spent">Total Spent</SelectItem>
            <SelectItem value="total_visits">Visits</SelectItem>
            <SelectItem value="udhaar_balance">Udhaar</SelectItem>
            <SelectItem value="loyalty_points">Points</SelectItem>
          </SelectContent>
        </Select>

        <Button
          onClick={() => router.push('/dashboard/clients/new')}
          className="bg-gold hover:bg-gold/90 text-black font-bold h-11 transition-all duration-150"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Client
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3.5 py-2 text-xs font-medium transition-all duration-150 ${
              tab === t.value
                ? 'bg-foreground text-white rounded-lg'
                : 'bg-card border border-border rounded-lg text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-card border border-gold/20 p-3 flex items-center gap-2 text-sm">
          <span className="font-medium">{selectedIds.size} selected</span>
          <Button variant="outline" size="sm" className="text-xs gap-1 transition-all duration-150" onClick={exportCSV}>
            <Download className="w-3 h-3" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1 transition-all duration-150" onClick={() => toast('Tag management coming soon')}>
            <Tag className="w-3 h-3" /> Add Tag
          </Button>
          <Button variant="ghost" size="sm" className="text-xs ml-auto transition-all duration-150" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center justify-center text-center">
          <Users className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground text-sm">
            {search ? 'No clients match your search' : 'No clients yet — add your first client'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              selected={selectedIds.has(client.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Showing {sorted.length} of {clients.length} clients
        </p>
      )}
    </div>
  );
}
