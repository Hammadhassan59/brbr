'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Plus, Download, MessageCircle, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  }, [salon]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Filter
  const filtered = clients.filter((c) => {
    // Search
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !(c.phone || '').includes(q)) return false;
    }
    // Tab filter
    switch (tab) {
      case 'vip': return c.is_vip;
      case 'regular': return !c.is_vip && !c.is_blacklisted && c.total_visits > 0;
      case 'lapsed': {
        // Would need last visit date; approximate with total_visits > 0
        return c.total_visits > 0;
      }
      case 'udhaar': return c.udhaar_balance > 0;
      case 'blacklisted': return c.is_blacklisted;
      default: return true;
    }
  });

  // Sort
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="pl-9"
          />
        </div>

        {/* Sort */}
        <Select value={sortBy} onValueChange={(v) => { if (v) setSortBy(v as SortBy); }}>
          <SelectTrigger className="w-[150px] h-9">
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

        {/* Add Client */}
        <Button
          onClick={() => router.push('/dashboard/clients/new')}
          className="bg-gold hover:bg-gold/90 text-black border border-gold"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Client
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all" className="text-xs">All ({clients.length})</TabsTrigger>
          <TabsTrigger value="vip" className="text-xs">VIP ({clients.filter((c) => c.is_vip).length})</TabsTrigger>
          <TabsTrigger value="regular" className="text-xs">Regular</TabsTrigger>
          <TabsTrigger value="udhaar" className="text-xs">Udhaar ({clients.filter((c) => c.udhaar_balance > 0).length})</TabsTrigger>
          <TabsTrigger value="blacklisted" className="text-xs">Blacklisted</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-gold/5 border border-gold/20 rounded-lg text-sm">
          <span className="font-medium">{selectedIds.size} selected</span>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={exportCSV}>
            <Download className="w-3 h-3" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1">
            <Tag className="w-3 h-3" /> Add Tag
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </Button>
          <Button variant="ghost" size="sm" className="text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Client grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            {search ? 'No clients match your search' : 'No clients yet — add your first client'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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

      {/* Count */}
      {!loading && sorted.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {sorted.length} of {clients.length} clients
        </p>
      )}
    </div>
  );
}
