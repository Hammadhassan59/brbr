'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';
import type { PurchaseOrder, Supplier, PurchaseOrderStatus } from '@/types/database';

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  pending: 'bg-yellow-500/15 text-yellow-600',
  received: 'bg-green-500/15 text-green-600',
  paid: 'bg-blue-500/15 text-blue-600',
  partial: 'bg-orange-500/15 text-orange-600',
};

export default function OrdersPage() {
  const { salon, currentBranch } = useAppStore();
  const [orders, setOrders] = useState<(PurchaseOrder & { supplier?: Supplier })[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [formSupplierId, setFormSupplierId] = useState('');
  const [formItems, setFormItems] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!salon || !currentBranch) return;
    setLoading(true);
    const [ordRes, supRes] = await Promise.all([
      supabase.from('purchase_orders').select('*, supplier:suppliers(*)').eq('branch_id', currentBranch.id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('salon_id', salon.id).order('name'),
    ]);
    if (ordRes.data) setOrders(ordRes.data as (PurchaseOrder & { supplier?: Supplier })[]);
    if (supRes.data) setSuppliers(supRes.data as Supplier[]);
    setLoading(false);
  }, [salon, currentBranch]);

  useEffect(() => { fetch(); }, [fetch]);

  async function createOrder() {
    if (!currentBranch || !formSupplierId || !formTotal) { toast.error('Fill required fields'); return; }
    setSaving(true);
    try {
      const items: { name: string; qty: number; price: number }[] = [];
      for (const line of formItems.split('\n').filter((l) => l.trim())) {
        const lastDash = line.lastIndexOf('-');
        const secondLastDash = line.lastIndexOf('-', lastDash - 1);
        if (lastDash === -1 || secondLastDash === -1) {
          toast.error(`Malformed item line: "${line.trim()}"`);
          continue;
        }
        const name = line.slice(0, secondLastDash).trim();
        const qty = Number(line.slice(secondLastDash + 1, lastDash).trim());
        const price = Number(line.slice(lastDash + 1).trim());
        if (!name || isNaN(qty) || isNaN(price)) {
          toast.error(`Invalid qty/price in: "${line.trim()}"`);
          continue;
        }
        items.push({ name, qty, price });
      }
      await supabase.from('purchase_orders').insert({
        supplier_id: formSupplierId, branch_id: currentBranch.id,
        items: JSON.parse(JSON.stringify(items)), total_amount: Number(formTotal), notes: formNotes || null,
      });
      toast.success('Order created');
      setShowForm(false); setFormSupplierId(''); setFormItems(''); setFormTotal(''); setFormNotes('');
      fetch();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function updateStatus(orderId: string, status: PurchaseOrderStatus) {
    await supabase.from('purchase_orders').update({ status }).eq('id', orderId);
    toast.success(`Order marked as ${status}`);
    fetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Purchase Orders</h2>
        <Button onClick={() => setShowForm(true)} className="bg-gold hover:bg-gold/90 text-black font-bold" size="sm"><Plus className="w-4 h-4 mr-1" /> New Order</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No purchase orders yet</p>
      ) : (
        <div className="space-y-3 stagger-children">
          {orders.map((o) => (
            <Card key={o.id} className="border-border animate-fade-up hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium">{o.supplier?.name || 'Unknown supplier'}</p>
                    <p className="text-xs text-muted-foreground">{formatPKDate(o.created_at)}{o.notes && ` · ${o.notes}`}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatPKR(o.total_amount)}</p>
                    {o.paid_amount > 0 && o.paid_amount < o.total_amount && (
                      <p className="text-xs text-muted-foreground">Paid: {formatPKR(o.paid_amount)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`text-[10px] ${STATUS_COLORS[o.status]}`}>{o.status}</Badge>
                  {o.status === 'pending' && <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => updateStatus(o.id, 'received')}>Mark Received</Button>}
                  {o.status === 'received' && <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => updateStatus(o.id, 'paid')}>Mark Paid</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Order Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Supplier *</Label>
              <Select value={formSupplierId} onValueChange={(v) => { if (v) setFormSupplierId(v); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Items (one per line: Name - Qty - Price)</Label>
              <textarea value={formItems} onChange={(e) => setFormItems(e.target.value)} rows={4} placeholder={"Keune Color - 10 - 800\nWella Shampoo - 5 - 450\nOPI Nail Polish - 12 - 350"}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
            <div><Label className="text-xs">Total Amount (Rs) *</Label><Input type="number" value={formTotal} onChange={(e) => setFormTotal(e.target.value)} className="mt-1" inputMode="numeric" /></div>
            <div><Label className="text-xs">Notes</Label><Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="mt-1" /></div>
            <Button onClick={createOrder} disabled={saving} className="w-full bg-gold text-black border border-gold">{saving ? 'Creating...' : 'Create Order'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
