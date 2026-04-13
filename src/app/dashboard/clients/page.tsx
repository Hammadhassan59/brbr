'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Plus, Download, Tag, UserRound, LayoutGrid, List } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientCard } from './components/client-card';
import { EmptyState } from '@/components/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPKR } from '@/lib/utils/currency';
import type { Client } from '@/types/database';

type ViewMode = 'card' | 'list';
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('icut-clients-view') as ViewMode) || 'card';
    return 'card';
  });

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
    a.download = 'icut-clients.csv';
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
      <div className="flex flex-wrap items-center gap-3">
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

        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => { setViewMode('card'); localStorage.setItem('icut-clients-view', 'card'); }}
            className={`p-2 transition-all duration-150 ${viewMode === 'card' ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'}`}
            title="Card view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setViewMode('list'); localStorage.setItem('icut-clients-view', 'list'); }}
            className={`p-2 transition-all duration-150 ${viewMode === 'list' ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

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
        <EmptyState icon={UserRound} text="noClientsYet" ctaLabel="addClient" ctaHref="/dashboard/clients?action=new" />
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {sorted.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              selected={selectedIds.has(client.id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pl-4"><span className="sr-only">Select</span></TableHead>
                <TableHead className="pl-2">Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-center">Visits</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Udhaar</TableHead>
                <TableHead className="text-center">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/dashboard/clients/${c.id}`)}>
                  <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={(e) => toggleSelect(c.id, e.target.checked)} className="rounded" />
                  </TableCell>
                  <TableCell className="pl-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{c.name}</span>
                      {c.is_vip && <span className="text-gold text-xs">VIP</span>}
                      {c.is_blacklisted && <span className="text-destructive text-xs">Blocked</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.phone || '—'}</TableCell>
                  <TableCell className="text-center text-sm">{c.total_visits}</TableCell>
                  <TableCell className="text-right text-sm">{formatPKR(c.total_spent)}</TableCell>
                  <TableCell className="text-right text-sm">{c.udhaar_balance > 0 ? <span className="text-destructive">{formatPKR(c.udhaar_balance)}</span> : '—'}</TableCell>
                  <TableCell className="text-center text-sm">{c.loyalty_points > 0 ? c.loyalty_points : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
