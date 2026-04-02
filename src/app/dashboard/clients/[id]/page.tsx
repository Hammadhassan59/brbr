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

  // Udhaar payment modal
  const [showUdhaarModal, setShowUdhaarModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  // Inline notes editing
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
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!client) {
    return <div className="text-center py-16 text-muted-foreground">Client not found</div>;
  }

  const initials = client.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      {/* Back + Edit */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/clients')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Clients
        </Button>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/clients/${client.id}/edit`)}>
            <Edit className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gold/20 text-gold text-xl font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-heading text-xl font-bold">{client.name}</h2>
                {client.is_vip && <Star className="w-4 h-4 text-gold fill-gold" />}
                {client.is_blacklisted && <Badge variant="destructive">Blacklisted</Badge>}
              </div>
              {client.phone && (
                <a href={`https://wa.me/92${client.phone.replace(/[-\s]/g, '').replace(/^0/, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-gold">
                  <Phone className="w-3 h-3" /> {client.phone}
                </a>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                <span className="flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-gold" />
                  {client.loyalty_points} points ({formatPKR(client.loyalty_points * 0.5)})
                </span>
                <Separator orientation="vertical" className="h-4" />
                <span>{client.total_visits} visits</span>
                <Separator orientation="vertical" className="h-4" />
                <span>{formatPKR(client.total_spent)} spent</span>
                <Separator orientation="vertical" className="h-4" />
                <span>Since {formatPKDate(client.created_at)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="visits">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="visits" className="text-xs gap-1"><Calendar className="w-3 h-3" /> Visits</TabsTrigger>
          <TabsTrigger value="udhaar" className="text-xs gap-1"><CreditCard className="w-3 h-3" /> Udhaar</TabsTrigger>
          <TabsTrigger value="packages" className="text-xs gap-1"><Package className="w-3 h-3" /> Packages</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs gap-1"><StickyNote className="w-3 h-3" /> Notes</TabsTrigger>
          <TabsTrigger value="loyalty" className="text-xs gap-1"><Award className="w-3 h-3" /> Loyalty</TabsTrigger>
        </TabsList>

        {/* TAB 1: Visit History */}
        <TabsContent value="visits" className="mt-4">
          {bills.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No visit history yet</p>
          ) : (
            <div className="space-y-3">
              {bills.map((bill) => (
                <Card key={bill.id}>
                  <CardContent className="p-4">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: Udhaar Ledger */}
        <TabsContent value="udhaar" className="mt-4 space-y-4">
          {/* Balance */}
          <Card className={client.udhaar_balance > 0 ? 'border-red-500/20 bg-red-500/10' : 'border-green-500/20 bg-green-500/10'}>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Outstanding Balance</p>
              <p className={`text-3xl font-heading font-bold ${client.udhaar_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatPKR(client.udhaar_balance)}
              </p>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={() => setShowUdhaarModal(true)} className="bg-gold text-black border border-gold">
              + Record Payment
            </Button>
            {client.udhaar_balance > 0 && client.phone && (
              <Button variant="outline" onClick={sendUdhaarReminder} className="gap-1">
                <MessageCircle className="w-4 h-4" /> Send Reminder
              </Button>
            )}
          </div>

          {/* Transaction history */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Bills that added udhaar */}
                {bills.filter((b) => b.udhaar_added > 0).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <p>{formatPKDate(b.created_at)}</p>
                      <p className="text-xs text-muted-foreground">Bill #{b.bill_number}</p>
                    </div>
                    <span className="text-red-600 font-medium">+{formatPKR(b.udhaar_added)}</span>
                  </div>
                ))}
                {/* Payments */}
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Packages */}
        <TabsContent value="packages" className="mt-4">
          {clientPackages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No packages assigned</p>
          ) : (
            <div className="space-y-3">
              {clientPackages.map((cp) => (
                <Card key={cp.id} className={cp.is_active ? '' : 'opacity-50'}>
                  <CardContent className="p-4">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB 4: Notes */}
        <TabsContent value="notes" className="mt-4 space-y-4">
          <Card className={client.allergy_notes ? 'border-red-500/20 bg-red-500/10' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className={`text-sm font-medium ${client.allergy_notes ? 'text-red-600' : ''}`}>Allergy / Sensitivity</h4>
                <button
                  onClick={() => { setEditingNotes('allergy_notes'); setEditingNotesValue(client.allergy_notes || ''); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
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
                    className="text-sm"
                    placeholder="e.g. Allergic to ammonia-based dyes"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveNotes('allergy_notes')} disabled={savingNotes} className="bg-gold text-black border border-gold text-xs h-7">
                      {savingNotes ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingNotes(null)} className="text-xs h-7">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={`text-sm ${client.allergy_notes ? 'text-red-600' : 'text-muted-foreground'}`}>{client.allergy_notes || 'None recorded'}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-medium">General Notes</h4>
                <button
                  onClick={() => { setEditingNotes('notes'); setEditingNotesValue(client.notes || ''); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
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
                    className="text-sm"
                    placeholder="General notes about this client"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveNotes('notes')} disabled={savingNotes} className="bg-gold text-black border border-gold text-xs h-7">
                      {savingNotes ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingNotes(null)} className="text-xs h-7">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{client.notes || 'No notes'}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-medium">Hair Notes</h4>
                <button
                  onClick={() => { setEditingNotes('hair_notes'); setEditingNotesValue(client.hair_notes || ''); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
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
                    className="text-sm"
                    placeholder="Hair type, preferred styles, etc."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveNotes('hair_notes')} disabled={savingNotes} className="bg-gold text-black border border-gold text-xs h-7">
                      {savingNotes ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingNotes(null)} className="text-xs h-7">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{client.hair_notes || 'No hair notes'}</p>
              )}
            </CardContent>
          </Card>
          {stats && (
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-2">Preferences</h4>
                <div className="space-y-1 text-sm">
                  {stats.favourite_service && <p>Favourite service: <span className="font-medium">{stats.favourite_service}</span></p>}
                  {stats.favourite_stylist && <p>Favourite stylist: <span className="font-medium">{stats.favourite_stylist}</span></p>}
                  {stats.last_visit_date && <p>Last visit: <span className="font-medium">{formatPKDate(stats.last_visit_date)}</span></p>}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 5: Loyalty */}
        <TabsContent value="loyalty" className="mt-4 space-y-4">
          <Card className="border-gold/30 bg-gold/5">
            <CardContent className="p-4 text-center">
              <Award className="w-8 h-8 text-gold mx-auto mb-2" />
              <p className="text-3xl font-heading font-bold">{client.loyalty_points}</p>
              <p className="text-sm text-muted-foreground">= {formatPKR(client.loyalty_points * 0.5)} value</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Points History</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Udhaar Payment Modal */}
      <Dialog open={showUdhaarModal} onOpenChange={setShowUdhaarModal}>
        <DialogContent className="max-w-sm">
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
                className="mt-1 text-lg"
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => { if (v) setPaymentMethod(v); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="jazzcash">JazzCash</SelectItem>
                  <SelectItem value="easypaisa">EasyPaisa</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowUdhaarModal(false)} className="flex-1">Cancel</Button>
              <Button onClick={recordPayment} disabled={savingPayment} className="flex-1 bg-gold text-black border border-gold">
                {savingPayment ? 'Saving...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
