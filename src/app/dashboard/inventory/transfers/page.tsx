'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils/dates';
import { transferStock, listStockTransfers } from '@/app/actions/stock-transfers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import type { Product, StockTransfer, BranchProduct } from '@/types/database';

export default function TransfersPage() {
  const router = useRouter();
  const { salon, branches, currentBranch } = useAppStore();
  const canManageInventory = usePermission('manage_inventory');
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);

  useEffect(() => {
    if (!canManageInventory) {
      toast.error('You do not have permission to manage inventory');
      router.replace('/dashboard');
    }
  }, [canManageInventory, router]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Per-branch stock map — fetched on dialog open so the quantity input can
  // validate against the from-branch's current stock instantly (not just at
  // submit time, where the server is authoritative).
  const [fromBranchStock, setFromBranchStock] = useState<Map<string, number>>(new Map());

  const fetchAll = useCallback(async () => {
    if (!salon || !currentBranch) return;
    setLoading(true);
    try {
      const [txRes, prodRes] = await Promise.all([
        // listStockTransfers is Agent 1's action. Contract: returns raw
        // StockTransfer rows (no joins) for a given branch — the current
        // branch, since transfers are how owners see what moved in/out of
        // the branch they're operating today.
        listStockTransfers({ branchId: currentBranch.id, limit: 100 }),
        supabase.from('products').select('*').eq('salon_id', salon.id).eq('is_active', true).order('name'),
      ]);
      if (txRes.data) setTransfers(txRes.data as StockTransfer[]);
      if (prodRes.data) setProducts(prodRes.data as Product[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [salon, currentBranch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Load the from-branch's per-product stock when the dialog opens or the
  // from-branch selection changes. Lets the UI show "available: N" and block
  // over-transfers client-side before paying a server round-trip.
  useEffect(() => {
    if (!showForm || !fromBranchId) { setFromBranchStock(new Map()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('branch_products')
        .select('product_id,current_stock')
        .eq('branch_id', fromBranchId);
      if (cancelled) return;
      const map = new Map<string, number>();
      for (const row of (data || []) as Array<Pick<BranchProduct, 'product_id' | 'current_stock'>>) {
        map.set(row.product_id, Number(row.current_stock) || 0);
      }
      setFromBranchStock(map);
    })();
    return () => { cancelled = true; };
  }, [showForm, fromBranchId]);

  function openForm() {
    // Default from = currentBranch; to = any other branch (picked by user).
    setFromBranchId(currentBranch?.id || (branches[0]?.id ?? ''));
    setToBranchId('');
    setProductId('');
    setQuantity('');
    setNotes('');
    setProductSearch('');
    setShowForm(true);
  }

  async function submitTransfer() {
    if (!fromBranchId || !toBranchId) { toast.error('Pick both source and destination branches'); return; }
    if (fromBranchId === toBranchId) { toast.error('Source and destination must differ'); return; }
    if (!productId) { toast.error('Pick a product'); return; }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('Quantity must be a positive number'); return; }
    const available = fromBranchStock.get(productId) ?? 0;
    if (qty > available) { toast.error(`Only ${available} available in source branch`); return; }

    setSaving(true);
    try {
      const { error } = await transferStock({
        fromBranchId,
        toBranchId,
        productId,
        quantity: qty,
        notes: notes.trim() || null,
      });
      if (showActionError(error)) return;
      toast.success('Stock transferred');
      setShowForm(false);
      fetchAll();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setSaving(false);
    }
  }

  const otherBranches = branches.filter((b) => b.id !== fromBranchId);
  const selectedProduct = products.find((p) => p.id === productId);
  const availableInFrom = productId ? (fromBranchStock.get(productId) ?? 0) : 0;

  // Lookup maps: Agent 1's listStockTransfers returns raw rows, so resolve
  // branch + product display names client-side from data we already fetched.
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const filteredProducts = products.filter((p) => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
  });

  // Only one branch? Surface a clear empty-state instead of a useless form.
  const hasMultipleBranches = branches.length >= 2;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-heading font-bold">Stock Transfers</h1>
          <p className="text-xs text-muted-foreground">
            Transfers involving <span className="font-medium text-foreground">{currentBranch?.name || 'current branch'}</span>.
            {' '}Switch branches in the header to see other locations.
          </p>
        </div>
        <Button
          onClick={openForm}
          disabled={!hasMultipleBranches}
          className="bg-gold hover:bg-gold/90 text-black font-bold"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" /> New Transfer
        </Button>
      </div>

      {!hasMultipleBranches && (
        <Card className="border-border">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Add a second branch to start transferring stock between locations.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : transfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center bg-gold/10 border border-gold/30">
            <ArrowLeftRight className="w-6 h-6 text-gold" />
          </div>
          <p className="mt-3 font-bold text-sm">No transfers yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasMultipleBranches
              ? 'Move stock between branches to balance inventory across locations.'
              : 'You only have one branch. Transfers are only useful with two or more.'}
          </p>
          {hasMultipleBranches && (
            <Button
              onClick={openForm}
              className="mt-4 bg-gold hover:bg-gold/90 px-5 py-2.5 text-xs font-bold text-black"
            >
              <Plus className="w-4 h-4 mr-1" /> New Transfer
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="pr-4">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => {
                const prod = productMap.get(t.product_id);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="pl-4 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(t.created_at)}</TableCell>
                    <TableCell className="text-sm font-medium">{prod?.name ?? 'Unknown product'}</TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="outline" className="text-[10px]">{branchMap.get(t.from_branch_id) ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="outline" className="text-[10px]">{branchMap.get(t.to_branch_id) ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">{t.quantity} {prod?.unit || ''}</TableCell>
                    <TableCell className="pr-4 text-xs text-muted-foreground truncate max-w-[240px]">{t.notes || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Stock Transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="from-branch" className="text-xs">From Branch</Label>
                <Select value={fromBranchId} onValueChange={(v) => { const val = v ?? ''; setFromBranchId(val); if (val === toBranchId) setToBranchId(''); setProductId(''); }}>
                  <SelectTrigger id="from-branch" className="h-9">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to-branch" className="text-xs">To Branch</Label>
                <Select value={toBranchId} onValueChange={(v) => setToBranchId(v ?? '')}>
                  <SelectTrigger id="to-branch" className="h-9">
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Product</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name or brand..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <div className="border border-border rounded-md bg-card max-h-[180px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                {filteredProducts.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground text-center">No matches.</p>
                ) : filteredProducts.map((p) => {
                  const available = fromBranchStock.get(p.id) ?? 0;
                  const isSelected = productId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProductId(p.id)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b border-border last:border-b-0 transition-all duration-150 ${isSelected ? 'bg-gold/10' : 'hover:bg-secondary'}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{p.brand || '—'} · {p.inventory_type}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ml-2 ${available <= 0 ? 'text-red-600 border-red-500/25' : ''}`}
                      >
                        {available} {p.unit}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="qty" className="text-xs">
                  Quantity {selectedProduct ? `(${selectedProduct.unit})` : ''}
                </Label>
                <Input
                  id="qty"
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="text-xs text-muted-foreground pb-2">
                {productId ? (
                  <>Available in source: <span className="font-semibold text-foreground">{availableInFrom}</span></>
                ) : <>Pick a product first</>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for transfer, who requested, etc."
                rows={2}
                className="text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button
                size="sm"
                className="bg-gold hover:bg-gold/90 text-black font-bold"
                onClick={submitTransfer}
                disabled={saving}
              >
                {saving ? 'Transferring...' : 'Transfer Stock'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
