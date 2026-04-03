'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Star, Phone, Edit, ArrowLeft, Calendar, CreditCard,
  Package, StickyNote, Award, MessageCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate, formatDateTime } from '@/lib/utils/dates';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';
import type { Client, Bill, BillItem, UdhaarPayment, ClientPackage, Package as PkgType } from '@/types/database';

export default function ClientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<(Bill & { items?: BillItem[]; staff_name?: string })[]>([]);
  const [udhaarPayments, setUdhaarPayments] = useState<UdhaarPayment[]>([]);
  const [clientPackages, setClientPackages] = useState<(ClientPackage & { package?: PkgType })[]>([]);
  const [stats, setStats] = useState<{ favourite_service: string | null; favourite_stylist: string | null; last_visit_date: string | null } | null>(null);

  const [showUdhaarModal, setShowUdhaarModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  const [editingNotes, setEditingNotes] = useState<'notes' | 'hair_notes' | 'allergy_notes' | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  async function saveNotes(field: 'notes' | 'hair_notes' | 'allergy_notes') {
    if (!client) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ [field]: editingNotesValue })
        .eq('id', client.id);
      if (error) throw error;
      setClient({ ...client, [field]: editingNotesValue });
      setEditingNotes(null);
      toast.success('Notes updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingNotes(false);
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [clientRes, billsRes, udhaarRes, pkgRes, statsRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase
          .from('bills')
          .select('*, items:bill_items(*), staff:staff(name)')
          .eq('client_id', clientId)
          .eq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('udhaar_payments')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('client_packages')
          .select('*, package:packages(*)')
          .eq('client_id', clientId),
        supabase.rpc('get_client_stats', { p_client_id: clientId }),
      ]);

      if (clientRes.data) setClient(clientRes.data as Client);
      if (billsRes.data) setBills(billsRes.data as (Bill & { items?: BillItem[]; staff_name?: string })[]);
      if (udhaarRes.data) setUdhaarPayments(udhaarRes.data as UdhaarPayment[]);
      if (pkgRes.data) setClientPackages(pkgRes.data as (ClientPackage & { package?: PkgType })[]);
      if (statsRes.error) {
        toast.error('Could not load client stats');
        setStats({ favourite_service: null, favourite_stylist: null, last_visit_date: null });
      } else if (statsRes.data) {
        setStats(statsRes.data as { favourite_service: string | null; favourite_stylist: string | null; last_visit_date: string | null });
      }
    } catch {
      toast.error('Failed to load client data');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function recordPayment() {
    if (!client || !paymentAmount) return;
    setSavingPayment(true);
    try {
      const amount = Number(paymentAmount);
      if (amount <= 0) throw new Error('Invalid amount');

      await supabase.from('udhaar_payments').insert({
        client_id: client.id,
        amount,
        payment_method: paymentMethod,
      });

      await supabase
        .from('clients')
        .update({ udhaar_balance: Math.max(0, client.udhaar_balance - amount) })
        .eq('id', client.id);

      toast.success(`Payment of ${formatPKR(amount)} recorded`);
      setShowUdhaarModal(false);
      setPaymentAmount('');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSavingPayment(false);
    }
  }

  function sendUdhaarReminder() {
    if (!client?.phone) return;
    const msg = `Dear ${client.name}, your outstanding balance is ${formatPKR(client.udhaar_balance)}. Please clear it on your next visit. Thank you! — BrBr`;
    window.open(generateWhatsAppLink(client.phone, msg), '_blank');
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted calendar-card animate-pulse" />
        <div className="h-64 bg-muted calendar-card animate-pulse" />
      </div>
    );
  }

  if (!client) {
    return <div className="text-center py-16 text-muted-foreground">Client not found</div>;
  }

  const initials = client.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/clients')} className="calendar-card transition-all duration-150">
          <ArrowLeft className="w-4 h-4 mr-1" /> Clients
        </Button>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/clients/${client.id}/edit`)} className="calendar-card transition-all duration-150">
            <Edit className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>
      </div>

      <div className="calendar-card bg-card p-6 border border-border/30">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-gold/15 text-gold text-xl font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-heading text-xl font-bold">{client.name}</h2>
              {client.is_vip && <Star className="w-4 h-4 text-gold fill-gold" />}
              {client.is_blacklisted && <Badge variant="destructive">Blacklisted</Badge>}
            </div>
            {client.phone && (
              <a href={`https://wa.me/92${client.phone.replace(/[-\s]/g, '').replace(/^0/, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-gold transition-all duration-150">
                <Phone className="w-3 h-3" /> {client.phone}
              </a>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
              <span className="calendar-card bg-background/50 px-3 py-1.5 text-xs flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-gold" />
                {client.loyalty_points} points ({formatPKR(client.loyalty_points * 0.5)})
              </span>
              <span className="calendar-card bg-background/50 px-3 py-1.5 text-xs">{client.total_visits} visits</span>
              <span className="calendar-card bg-background/50 px-3 py-1.5 text-xs">{formatPKR(client.total_spent)} spent</span>
              <span className="calendar-card bg-background/50 px-3 py-1.5 text-xs">Since {formatPKDate(client.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="visits">
        <TabsList className="flex-wrap h-auto gap-1 bg-transparent">
          <TabsTrigger value="visits" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold/10 data-[state=active]:text-gold text-muted-foreground hover:text-foreground"><Calendar className="w-3 h-3" /> Visits</TabsTrigger>
          <TabsTrigger value="udhaar" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold/10 data-[state=active]:text-gold text-muted-foreground hover:text-foreground"><CreditCard className="w-3 h-3" /> Udhaar</TabsTrigger>
          <TabsTrigger value="packages" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold/10 data-[state=active]:text-gold text-muted-foreground hover:text-foreground"><Package className="w-3 h-3" /> Packages</TabsTrigger>
          <TabsTrigger value="notes" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold/10 data-[state=active]:text-gold text-muted-foreground hover:text-foreground"><StickyNote className="w-3 h-3" /> Notes</TabsTrigger>
          <TabsTrigger value="loyalty" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold/10 data-[state=active]:text-gold text-muted-foreground hover:text-foreground"><Award className="w-3 h-3" /> Loyalty</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="mt-4">
          {bills.length === 0 ? (
            <div className="calendar-card bg-card p-4 border border-border/30">
              <p className="text-center text-muted-foreground py-8">No visit history yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bills.map((bill) => (
                <div key={bill.id} className="calendar-card bg-background/50 border border-border/20 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{formatDateTime(bill.created_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        Bill #{bill.bill_number} · {(bill as { staff?: { name: string } }).staff?.name || 'Unknown stylist'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatPKR(bill.total_amount)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{bill.payment_method?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {bill.items?.map((item) => item.name).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="udhaar" className="mt-4 space-y-4">
          <div className={`calendar-card p-4 text-center ${client.udhaar_balance > 0 ? 'border-red-500/20 bg-red-500/10 border' : 'border-green-500/20 bg-green-500/10 border'}`}>
            <p className="text-sm text-muted-foreground mb-1">Outstanding Balance</p>
            <p className={`text-3xl font-heading font-bold ${client.udhaar_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatPKR(client.udhaar_balance)}
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setShowUdhaarModal(true)} className="calendar-card bg-gold text-black border border-gold transition-all duration-150">
              + Record Payment
            </Button>
            {client.udhaar_balance > 0 && client.phone && (
              <Button variant="outline" onClick={sendUdhaarReminder} className="calendar-card gap-1 transition-all duration-150">
                <MessageCircle className="w-4 h-4" /> Send Reminder
              </Button>
            )}
          </div>

          <div className="calendar-card bg-card border border-border/30">
            <div className="p-4 pb-2">
              <h3 className="text-sm font-medium">Transaction History</h3>
            </div>
            <div className="px-4 pb-4">
              <div className="space-y-2">
                {bills.filter((b) => b.udhaar_added > 0).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <p>{formatPKDate(b.created_at)}</p>
                      <p className="text-xs text-muted-foreground">Bill #{b.bill_number}</p>
                    </div>
                    <span className="text-red-600 font-medium">+{formatPKR(b.udhaar_added)}</span>
                  </div>
                ))}
                {udhaarPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <p>{formatDateTime(p.created_at)}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.payment_method || 'Payment'}</p>
                    </div>
                    <span className="text-green-600 font-medium">-{formatPKR(p.amount)}</span>
                  </div>
                ))}
                {bills.filter((b) => b.udhaar_added > 0).length === 0 && udhaarPayments.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">No transactions</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="packages" className="mt-4">
          {clientPackages.length === 0 ? (
            <div className="calendar-card bg-card p-4 border border-border/30">
              <p className="text-center text-muted-foreground py-8">No packages assigned</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clientPackages.map((cp) => (
                <div key={cp.id} className={`calendar-card bg-card p-4 border border-border/30 ${cp.is_active ? '' : 'opacity-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">{cp.package?.name || 'Package'}</p>
                      <p className="text-xs text-muted-foreground">
                        Purchased: {formatPKDate(cp.purchase_date)}
                        {cp.expiry_date && ` · Expires: ${formatPKDate(cp.expiry_date)}`}
                      </p>
                    </div>
                    <Badge variant={cp.is_active ? 'default' : 'secondary'}>
                      {cp.is_active ? 'Active' : 'Expired'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-4">
          <div className={`calendar-card bg-background/50 border p-4 ${client.allergy_notes ? 'border-red-500/20 bg-red-500/10' : 'border-border/20'}`}>
            <div className="flex items-center justify-between mb-1">
              <h4 className={`text-sm font-medium ${client.allergy_notes ? 'text-red-600' : ''}`}>Allergy / Sensitivity</h4>
              <button
                onClick={() => { setEditingNotes('allergy_notes'); setEditingNotesValue(client.allergy_notes || ''); }}
                className="calendar-card text-muted-foreground hover:text-foreground transition-all duration-150 p-1"
                aria-label="Edit allergy notes"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
            </div>
            {editingNotes === 'allergy_notes' ? (
              <div className="space-y-2">
                <Textarea
                  value={editingNotesValue}
                  onChange={(e) => setEditingNotesValue(e.target.value)}
                  rows={3}
                  className="text-sm calendar-card"
                  placeholder="e.g. Allergic to ammonia-based dyes"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveNotes('allergy_notes')} disabled={savingNotes} className="calendar-card bg-gold text-black border border-gold text-xs h-7 transition-all duration-150">
                    {savingNotes ? 'Saving...' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)} className="calendar-card text-xs h-7 transition-all duration-150">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className={`text-sm ${client.allergy_notes ? 'text-red-600' : 'text-muted-foreground'}`}>{client.allergy_notes || 'None recorded'}</p>
            )}
          </div>
          <div className="calendar-card bg-background/50 border border-border/20 p-4">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-medium">General Notes</h4>
              <button
                onClick={() => { setEditingNotes('notes'); setEditingNotesValue(client.notes || ''); }}
                className="calendar-card text-muted-foreground hover:text-foreground transition-all duration-150 p-1"
                aria-label="Edit general notes"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
            </div>
            {editingNotes === 'notes' ? (
              <div className="space-y-2">
                <Textarea
                  value={editingNotesValue}
                  onChange={(e) => setEditingNotesValue(e.target.value)}
                  rows={3}
                  className="text-sm calendar-card"
                  placeholder="General notes about this client"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveNotes('notes')} disabled={savingNotes} className="calendar-card bg-gold text-black border border-gold text-xs h-7 transition-all duration-150">
                    {savingNotes ? 'Saving...' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)} className="calendar-card text-xs h-7 transition-all duration-150">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{client.notes || 'No notes'}</p>
            )}
          </div>
          <div className="calendar-card bg-background/50 border border-border/20 p-4">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-medium">Hair Notes</h4>
              <button
                onClick={() => { setEditingNotes('hair_notes'); setEditingNotesValue(client.hair_notes || ''); }}
                className="calendar-card text-muted-foreground hover:text-foreground transition-all duration-150 p-1"
                aria-label="Edit hair notes"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
            </div>
            {editingNotes === 'hair_notes' ? (
              <div className="space-y-2">
                <Textarea
                  value={editingNotesValue}
                  onChange={(e) => setEditingNotesValue(e.target.value)}
                  rows={3}
                  className="text-sm calendar-card"
                  placeholder="Hair type, preferred styles, etc."
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveNotes('hair_notes')} disabled={savingNotes} className="calendar-card bg-gold text-black border border-gold text-xs h-7 transition-all duration-150">
                    {savingNotes ? 'Saving...' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)} className="calendar-card text-xs h-7 transition-all duration-150">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{client.hair_notes || 'No hair notes'}</p>
            )}
          </div>
          {stats && (
            <div className="calendar-card bg-background/50 border border-border/20 p-4">
              <h4 className="text-sm font-medium mb-2">Preferences</h4>
              <div className="space-y-1 text-sm">
                {stats.favourite_service && <p>Favourite service: <span className="font-medium">{stats.favourite_service}</span></p>}
                {stats.favourite_stylist && <p>Favourite stylist: <span className="font-medium">{stats.favourite_stylist}</span></p>}
                {stats.last_visit_date && <p>Last visit: <span className="font-medium">{formatPKDate(stats.last_visit_date)}</span></p>}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="loyalty" className="mt-4 space-y-4">
          <div className="calendar-card bg-gold/5 border border-gold/20 p-5 text-center">
            <Award className="w-8 h-8 text-gold mx-auto mb-2" />
            <p className="text-3xl font-heading font-bold">{client.loyalty_points}</p>
            <p className="text-sm text-muted-foreground">= {formatPKR(client.loyalty_points * 0.5)} value</p>
          </div>

          <div className="calendar-card bg-card border border-border/30">
            <div className="p-4 pb-2">
              <h3 className="text-sm font-medium">Points History</h3>
            </div>
            <div className="px-4 pb-4">
              <div className="space-y-2">
                {bills.filter((b) => b.loyalty_points_earned > 0 || b.loyalty_points_used > 0).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <p>{formatPKDate(b.created_at)}</p>
                      <p className="text-xs text-muted-foreground">Bill #{b.bill_number}</p>
                    </div>
                    <div className="text-right">
                      {b.loyalty_points_earned > 0 && <span className="text-green-600">+{b.loyalty_points_earned}</span>}
                      {b.loyalty_points_used > 0 && <span className="text-red-600 ml-2">-{b.loyalty_points_used}</span>}
                    </div>
                  </div>
                ))}
                {bills.filter((b) => b.loyalty_points_earned > 0 || b.loyalty_points_used > 0).length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">No points activity</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showUdhaarModal} onOpenChange={setShowUdhaarModal}>
        <DialogContent className="max-w-sm calendar-card">
          <DialogHeader>
            <DialogTitle>Record Udhaar Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount (Rs)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className="mt-1 text-lg calendar-card"
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => { if (v) setPaymentMethod(v); }}>
                <SelectTrigger className="mt-1 calendar-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="jazzcash">JazzCash</SelectItem>
                  <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowUdhaarModal(false)} className="flex-1 calendar-card transition-all duration-150">Cancel</Button>
              <Button onClick={recordPayment} disabled={savingPayment} className="flex-1 calendar-card bg-gold text-black border border-gold transition-all duration-150">
                {savingPayment ? 'Saving...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
