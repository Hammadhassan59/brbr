'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Phone as PhoneIcon } from 'lucide-react';
import { listSuppliers } from '@/app/actions/lists';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import { formatPKR } from '@/lib/utils/currency';
import { createSupplier, updateSupplier, recordSupplierPayment } from '@/app/actions/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import type { Supplier } from '@/types/database';

export default function SuppliersPage() {
  const router = useRouter();
  const { salon, currentBranch } = useAppStore();
  const canManageSuppliers = usePermission('manage_suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    if (!canManageSuppliers) {
      toast.error('You do not have permission to manage suppliers');
      router.replace('/dashboard');
    }
  }, [canManageSuppliers, router]);
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
    if (!salon || !currentBranch) return;
    setLoading(true);
    const { data } = await listSuppliers(currentBranch.id);
    setSuppliers(data);
    setLoading(false);
  }, [salon, currentBranch]);

  useEffect(() => { fetch(); }, [fetch]);

  function openForm(supplier?: Supplier) {
    if (supplier) { setEditSupplier(supplier); setFormName(supplier.name); setFormPhone(supplier.phone || ''); setFormNotes(supplier.notes || ''); }
    else { setEditSupplier(null); setFormName(''); setFormPhone(''); setFormNotes(''); }
    setShowForm(true);
  }

  async function saveSupplier() {
    if (!salon || !currentBranch || !formName.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      if (editSupplier) {
        const { error } = await updateSupplier(editSupplier.id, currentBranch.id, { name: formName.trim(), phone: formPhone || null, notes: formNotes || null });
        if (showActionError(error)) return;
        toast.success('Supplier updated');
      } else {
        const { error } = await createSupplier({ branchId: currentBranch.id, name: formName.trim(), phone: formPhone || null, notes: formNotes || null });
        if (showActionError(error)) return;
        toast.success('Supplier added');
      }
      setShowForm(false); fetch();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    finally { setSaving(false); }
  }

  async function recordPayment() {
    if (!paySupplier || !currentBranch) return;
    if (!payAmount) { toast.error('Enter a payment amount'); return; }
    setSavingPay(true);
    try {
      const amount = Number(payAmount);
      if (amount > paySupplier.udhaar_balance) { toast.error('Payment amount exceeds outstanding balance'); setSavingPay(false); return; }
      const { error } = await recordSupplierPayment(paySupplier.id, currentBranch.id, amount, paySupplier.udhaar_balance);
      if (showActionError(error)) return;
      toast.success(`Payment of ${formatPKR(amount)} recorded`);
      setShowPayment(false); setPayAmount(''); fetch();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    finally { setSavingPay(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="font-heading text-xl sm:text-2xl font-bold">Suppliers</h2>
        <Button onClick={() => openForm()} className="bg-gold hover:bg-gold/90 text-black font-bold w-full sm:w-auto" size="sm"><Plus className="w-4 h-4 mr-1" /> Add Supplier</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : suppliers.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No suppliers yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-children">
          {suppliers.map((s) => (
            <Card key={s.id} className="border-border animate-fade-up hover:shadow-md hover:border-gold/30 transition-shadow cursor-pointer" onClick={() => openForm(s)}>
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
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
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
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
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
