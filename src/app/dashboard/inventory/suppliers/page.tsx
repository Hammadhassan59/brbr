'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Phone as PhoneIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import toast from 'react-hot-toast';
import type { Supplier } from '@/types/database';

export default function SuppliersPage() {
  const { salon } = useAppStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Payment modal
  const [showPayment, setShowPayment] = useState(false);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [savingPay, setSavingPay] = useState(false);

  const fetch = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').eq('salon_id', salon.id).order('name');
    if (data) setSuppliers(data as Supplier[]);
    setLoading(false);
  }, [salon]);

  useEffect(() => { fetch(); }, [fetch]);

  function openForm(supplier?: Supplier) {
    if (supplier) { setEditSupplier(supplier); setFormName(supplier.name); setFormPhone(supplier.phone || ''); setFormNotes(supplier.notes || ''); }
    else { setEditSupplier(null); setFormName(''); setFormPhone(''); setFormNotes(''); }
    setShowForm(true);
  }

  async function saveSupplier() {
    if (!salon || !formName.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const data = { salon_id: salon.id, name: formName.trim(), phone: formPhone || null, notes: formNotes || null };
      if (editSupplier) {
        await supabase.from('suppliers').update(data).eq('id', editSupplier.id);
        toast.success('Supplier updated');
      } else {
        await supabase.from('suppliers').insert(data);
        toast.success('Supplier added');
      }
      setShowForm(false); fetch();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function recordPayment() {
    if (!paySupplier) return;
    if (!payAmount) { toast.error('Enter a payment amount'); return; }
    setSavingPay(true);
    try {
      const amount = Number(payAmount);
      if (amount > paySupplier.udhaar_balance) { toast.error('Payment amount exceeds outstanding balance'); setSavingPay(false); return; }
      await supabase.from('suppliers').update({
        udhaar_balance: paySupplier.udhaar_balance - amount,
      }).eq('id', paySupplier.id);
      toast.success(`Payment of ${formatPKR(amount)} recorded`);
      setShowPayment(false); setPayAmount(''); fetch();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSavingPay(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Suppliers</h2>
        <Button onClick={() => openForm()} className="bg-gold text-black border border-gold" size="sm"><Plus className="w-4 h-4 mr-1" /> Add Supplier</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : suppliers.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No suppliers yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suppliers.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openForm(s)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    {s.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><PhoneIcon className="w-3 h-3" /> {s.phone}</p>}
                    {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                  </div>
                  <div className="text-right">
                    {s.udhaar_balance > 0 ? (
                      <div>
                        <Badge variant="destructive" className="text-[10px]">We owe {formatPKR(s.udhaar_balance)}</Badge>
                        <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={(e) => { e.stopPropagation(); setPaySupplier(s); setShowPayment(true); }}>Pay</Button>
                      </div>
                    ) : <Badge variant="outline" className="text-[10px] text-green-600">Settled</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Supplier Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editSupplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Phone</Label><Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" /></div>
            <div><Label className="text-xs">Notes</Label><Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="mt-1" /></div>
            <Button onClick={saveSupplier} disabled={saving} className="w-full bg-gold text-black border border-gold">{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pay {paySupplier?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Outstanding: <span className="font-bold text-red-600">{formatPKR(paySupplier?.udhaar_balance || 0)}</span></p>
            <div><Label className="text-xs">Payment Amount (Rs)</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1" inputMode="numeric" /></div>
            <Button onClick={recordPayment} disabled={savingPay} className="w-full bg-gold text-black border border-gold">{savingPay ? 'Saving...' : 'Record Payment'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
