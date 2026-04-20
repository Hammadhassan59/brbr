'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { createClient, updateClientStats } from '@/app/actions/clients';
import { createBill, createBillItems, recordTip, updateCashDrawer, updatePromoCodeUsage, rollbackBill } from '@/app/actions/bills';
import { deductStockForBill } from '@/app/actions/inventory';
import { updateAppointmentStatus } from '@/app/actions/appointments';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BillBuilder, type BillLineItem } from './components/bill-builder';
import { PaymentPanel, type SplitPaymentEntry } from './components/payment-panel';
import { CheckoutConfirmation } from './components/checkout-confirmation';
import { getCheckoutBlockReason } from './components/checkout-gate';
import type { Client, Staff, Service, Product, PaymentMethod, AppointmentWithDetails, Package as PkgType, BranchProduct } from '@/types/database';

export default function POSPage() {
  return (
    <Suspense>
      <POSContent />
    </Suspense>
  );
}

function POSContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { salon, currentBranch, currentStaff } = useAppStore();
  const canUsePos = usePermission('use_pos');

  // Page-level gate — anyone without `use_pos` gets bounced back to the
  // dashboard with a toast. Owners/partners are lockout-safe.
  useEffect(() => {
    if (!canUsePos) {
      toast.error('You do not have permission to use the POS');
      router.replace('/dashboard');
    }
  }, [canUsePos, router]);

  // Data
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<PkgType[]>([]);
  const [stylists, setStylists] = useState<Staff[]>([]);

  // Client selection
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  // Stylist selection
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // Bill
  const [billNumber, setBillNumber] = useState('');
  const [items, setItems] = useState<BillLineItem[]>([]);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  // Discounts
  const [discountType, setDiscountType] = useState<'flat' | 'percentage' | null>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [loyaltyPointsUsed, setLoyaltyPointsUsed] = useState(0);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState(0);
  const [reference, setReference] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPaymentEntry[]>([]);
  const [tipAmount, setTipAmount] = useState(0);

  // Checkout
  const [showCheckout, setShowCheckout] = useState(false);
  const [showMobilePayment, setShowMobilePayment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const manualDiscount = discountType === 'flat'
    ? discountValue
    : discountType === 'percentage'
      ? subtotal * discountValue / 100
      : 0;
  const loyaltyDiscount = loyaltyPointsUsed * 0.5;
  const totalDiscount = manualDiscount + promoDiscount + loyaltyDiscount;
  const gstRate = salon?.gst_enabled ? (salon.gst_rate || 0) : 0;
  const taxAmount = (subtotal - totalDiscount) * gstRate / 100;
  const total = Math.max(0, subtotal - totalDiscount + taxAmount);

  // Load data
  useEffect(() => {
    if (!salon || !currentBranch) return;
    async function load() {
      // Staff at this branch via staff_branches (migration 036 — staff can
      // belong to multiple branches, so primary_branch_id alone is wrong).
      const { data: memberRows } = await supabase
        .from('staff_branches')
        .select('staff_id')
        .eq('branch_id', currentBranch!.id);
      const staffIds = (memberRows || []).map((r: { staff_id: string }) => r.staff_id);

      const [svcRes, prodRes, branchProdRes, pkgRes, staffRes] = await Promise.all([
        supabase.from('services').select('*').eq('salon_id', salon!.id).eq('branch_id', currentBranch!.id).eq('is_active', true).order('sort_order'),
        // Products are per-branch after migration 037 — the POS only rings
        // up products that belong to the branch the cashier is working in.
        supabase.from('products').select('*').eq('salon_id', salon!.id).eq('branch_id', currentBranch!.id).eq('is_active', true).order('name'),
        // Per-branch inventory (migration 035). The salon-level
        // products.current_stock / .low_stock_threshold are tombstones —
        // always merge these in for display + checkout warnings.
        supabase.from('branch_products').select('product_id,current_stock,low_stock_threshold').eq('branch_id', currentBranch!.id),
        supabase.from('packages').select('*').eq('salon_id', salon!.id).eq('branch_id', currentBranch!.id).eq('is_active', true).order('name'),
        staffIds.length > 0
          ? supabase.from('staff').select('*').in('id', staffIds).eq('is_active', true).in('role', ['senior_stylist', 'junior_stylist']).order('name')
          : Promise.resolve({ data: [] as Staff[] }),
      ]);
      if (svcRes.data) setServices(svcRes.data as Service[]);
      if (prodRes.data) {
        const bpMap = new Map<string, Pick<BranchProduct, 'current_stock' | 'low_stock_threshold'>>();
        for (const row of (branchProdRes.data || []) as Array<Pick<BranchProduct, 'product_id' | 'current_stock' | 'low_stock_threshold'>>) {
          bpMap.set(row.product_id, { current_stock: row.current_stock, low_stock_threshold: row.low_stock_threshold });
        }
        // Overwrite the deprecated salon-level stock fields on each Product
        // with the branch-specific values so downstream UI (BillBuilder,
        // low-stock warnings) just works.
        const merged = (prodRes.data as Product[]).map((p) => {
          const bp = bpMap.get(p.id);
          return {
            ...p,
            current_stock: bp ? Number(bp.current_stock) : 0,
            low_stock_threshold: bp ? Number(bp.low_stock_threshold) : 0,
          };
        });
        setProducts(merged);
      }
      if (pkgRes.data) setPackages(pkgRes.data as PkgType[]);
      if (staffRes.data) setStylists(staffRes.data as Staff[]);
      setLoading(false);
    }
    load();
  }, [salon, currentBranch]);

  // Display-only bill number preview (actual number is generated server-side at checkout)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    setBillNumber(`BB-${today}-...`);
  }, []);

  // Pre-fill from appointment
  useEffect(() => {
    const aptId = searchParams.get('appointment');
    if (!aptId) return;
    setAppointmentId(aptId);

    async function loadAppointment() {
      const { data } = await supabase
        .from('appointments')
        .select('*, client:clients(*), staff:staff(*), services:appointment_services(*)')
        .eq('id', aptId)
        .single();
      if (!data) return;
      const apt = data as AppointmentWithDetails;

      if (apt.client) setSelectedClient(apt.client);
      if (apt.staff_id) setSelectedStaffId(apt.staff_id);

      if (apt.services && apt.services.length > 0) {
        setItems(apt.services.map((s) => ({
          id: crypto.randomUUID(),
          type: 'service' as const,
          serviceId: s.service_id || undefined,
          name: s.service_name,
          stylistName: apt.staff?.name,
          quantity: 1,
          unitPrice: s.price,
          totalPrice: s.price,
        })));
      }
    }
    loadAppointment();
  }, [searchParams]);

  // Client search (ISSUE-008: typed .ilike() calls, no .or() string templating)
  const searchClients = useCallback(async (query: string) => {
    if (!salon || !currentBranch || query.length < 2) { setClientResults([]); return; }
    const trimmed = query.trim().slice(0, 100);
    if (!trimmed) { setClientResults([]); return; }
    const pattern = `%${trimmed}%`;
    const [nameRes, phoneRes] = await Promise.all([
      supabase.from('clients').select('*').eq('salon_id', salon.id).eq('branch_id', currentBranch.id).ilike('name', pattern).limit(10),
      supabase.from('clients').select('*').eq('salon_id', salon.id).eq('branch_id', currentBranch.id).ilike('phone', pattern).limit(10),
    ]);
    const merged = new Map<string, Client>();
    for (const row of (nameRes.data || []) as Client[]) merged.set(row.id, row);
    for (const row of (phoneRes.data || []) as Client[]) merged.set(row.id, row);
    setClientResults(Array.from(merged.values()).slice(0, 10));
  }, [salon, currentBranch]);

  function openNewClientForm(prefill: string) {
    const phoneLike = /\d/.test(prefill);
    setShowNewClient(true);
    if (phoneLike) {
      setNewClientPhone(prefill);
      setNewClientName('');
    } else {
      setNewClientName(prefill);
      setNewClientPhone('');
    }
    setClientSearch('');
    setClientResults([]);
  }

  async function createNewClient() {
    if (!salon || !currentBranch || !newClientName.trim()) { toast.error('Client name is required'); return; }
    if (!newClientPhone.trim()) { toast.error('Phone number is required'); return; }
    try {
      const { data, error } = await createClient({
        branchId: currentBranch.id,
        name: newClientName.trim(),
        phone: newClientPhone?.trim() || null,
      });
      if (showActionError(error)) return;
      setSelectedClient(data as Client);
      setClientSearch('');
      setClientResults([]);
      setShowNewClient(false);
      setNewClientName('');
      setNewClientPhone('');
      toast.success(`Client "${data.name}" created`);
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to create client');
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => searchClients(clientSearch), 300);
    return () => clearTimeout(timer);
  }, [clientSearch, searchClients]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return;
      switch (e.key.toLowerCase()) {
        case 'c': setPaymentMethod('cash'); break;
        case 'j': setPaymentMethod('jazzcash'); break;
        case 'escape': router.push('/dashboard'); break;
        case 'enter': {
          const splitTotal = splitPayments.reduce((sum, s) => sum + s.amount, 0);
          const canCheckout = getCheckoutBlockReason({
            total,
            tipAmount,
            hasStylist: !!selectedStaffId,
            hasClient: !!selectedClient,
            selectedPaymentMethod: paymentMethod,
            cashReceived,
            isSplit,
            splitRemaining: total - splitTotal,
            saving,
          }) === null;
          if (canCheckout) setShowCheckout(true);
          break;
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [total, paymentMethod, router, selectedStaffId, selectedClient, cashReceived, isSplit, splitPayments, saving, tipAmount]);

  // Add service to bill
  function addService(svc: Service) {
    const stylist = stylists.find((s) => s.id === selectedStaffId);
    setItems([...items, {
      id: crypto.randomUUID(),
      type: 'service',
      serviceId: svc.id,
      name: svc.name,
      stylistName: stylist?.name,
      quantity: 1,
      unitPrice: svc.base_price,
      totalPrice: svc.base_price,
    }]);
  }

  function addPackage(pkg: PkgType) {
    const stylist = stylists.find((s) => s.id === selectedStaffId);
    const svcList = (pkg.services as unknown as { serviceName: string; quantity: number }[]) || [];
    const desc = svcList.map(s => `${s.quantity}x ${s.serviceName}`).join(', ');
    setItems([...items, {
      id: crypto.randomUUID(),
      type: 'service',
      name: `${pkg.name}`,
      stylistName: stylist?.name ? `${stylist.name} — ${desc}` : desc,
      quantity: 1,
      unitPrice: pkg.price,
      totalPrice: pkg.price,
    }]);
  }

  function addProduct(prod: Product) {
    const existing = items.find((i) => i.productId === prod.id);
    if (existing) {
      updateItemQty(existing.id, existing.quantity + 1);
      return;
    }
    setItems([...items, {
      id: crypto.randomUUID(),
      type: 'product',
      productId: prod.id,
      name: prod.name,
      quantity: 1,
      unitPrice: prod.retail_price,
      totalPrice: prod.retail_price,
    }]);
  }

  function removeItem(id: string) { setItems(items.filter((i) => i.id !== id)); }

  function updateItemPrice(id: string, price: number) {
    setItems(items.map((i) => i.id === id ? { ...i, unitPrice: price, totalPrice: price * i.quantity } : i));
  }

  function updateItemQty(id: string, qty: number) {
    setItems(items.map((i) => i.id === id ? { ...i, quantity: qty, totalPrice: i.unitPrice * qty } : i));
  }

  async function applyPromo(code: string) {
    if (!salon || !currentBranch || !code) return;
    const { data } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('salon_id', salon.id)
      .eq('branch_id', currentBranch.id)
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (!data) { toast.error('Invalid promo code'); return; }
    if (data.expiry_date && new Date(data.expiry_date) < new Date()) { toast.error('Promo expired'); return; }
    if (data.max_uses && data.used_count >= data.max_uses) { toast.error('Promo exhausted'); return; }
    if (data.min_bill_amount && subtotal < data.min_bill_amount) { toast.error(`Min bill: ${formatPKR(data.min_bill_amount)}`); return; }

    setPromoCode(code);
    const disc = data.discount_type === 'flat' ? data.discount_value : subtotal * data.discount_value / 100;
    setPromoDiscount(disc);
    toast.success(`Promo applied: -${formatPKR(disc)}`);
  }

  async function handleConfirm() {
    if (!salon || !currentBranch) return;
    setSaving(true);

    try {
      const actualMethod = isSplit ? 'split' : paymentMethod;
      const pointsEarned = Math.floor(total / 100) * 10; // 10 pts per Rs100

      // Create bill (bill number generated server-side)
      const { data: bill, error: billErr } = await createBill({
        branchId: currentBranch.id,
        appointmentId,
        clientId: selectedClient?.id || null,
        staffId: selectedStaffId || null,
        subtotal,
        discountAmount: totalDiscount,
        discountType: discountType,
        taxAmount,
        tipAmount,
        totalAmount: total,
        paidAmount: total,
        paymentMethod: actualMethod || 'cash',
        paymentDetails: isSplit ? JSON.parse(JSON.stringify(splitPayments)) : reference ? { reference } : null,
        udhaarAdded: actualMethod === 'udhaar' ? total : 0,
        loyaltyPointsUsed,
        loyaltyPointsEarned: pointsEarned,
        promoCode: promoCode || null,
      });
      if (showActionError(billErr)) return;

      try {
        // Create bill items
        const { error: itemsErr } = await createBillItems(bill.id, items.map((i) => ({
          type: i.type,
          serviceId: i.serviceId || null,
          productId: i.productId || null,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
        })));
        if (itemsErr) throw new Error(itemsErr);

        // Update client stats
        if (selectedClient) {
          const { error: statsErr } = await updateClientStats(selectedClient.id, currentBranch.id, {
            loyaltyPoints: selectedClient.loyalty_points - loyaltyPointsUsed + pointsEarned,
            totalVisits: selectedClient.total_visits + 1,
            totalSpent: selectedClient.total_spent + total,
            udhaarBalance: actualMethod === 'udhaar'
              ? selectedClient.udhaar_balance + total
              : selectedClient.udhaar_balance,
          });
          if (statsErr) throw new Error(statsErr);
        }

        // Record tip — always attributed to the stylist selected on the bill.
        if (tipAmount > 0 && selectedStaffId) {
          const { error: tipErr } = await recordTip(selectedStaffId, bill.id, tipAmount);
          if (tipErr) throw new Error(tipErr);
        }

        // Update cash drawer
        if (actualMethod === 'cash' || (isSplit && splitPayments.some((s) => s.method === 'cash'))) {
          const cashAmount = isSplit
            ? splitPayments.filter((s) => s.method === 'cash').reduce((sum, s) => sum + s.amount, 0)
            : total;
          const { error: drawerErr } = await updateCashDrawer(currentBranch.id, cashAmount);
          if (drawerErr) throw new Error(drawerErr);
        }

        // Update appointment status
        if (appointmentId) {
          const { error: aptErr } = await updateAppointmentStatus(appointmentId, 'done');
          if (aptErr) throw new Error(aptErr);
        }

        // Deduct inventory: retail products sold + back-bar used by services.
        // Best-effort: we don't roll back the bill on inventory failure, but we
        // do surface a toast so the owner knows to reconcile.
        const stockRes = await deductStockForBill({
          branchId: currentBranch.id,
          billId: bill.id,
          items: items.map((i) => ({
            type: i.type,
            serviceId: i.serviceId || null,
            productId: i.productId || null,
            quantity: i.quantity,
            name: i.name,
          })),
        });
        if (stockRes.error) {
          toast.error(`Inventory not updated: ${stockRes.error}`);
        }

        // Update promo used_count
        if (promoCode) {
          try {
            await updatePromoCodeUsage(promoCode);
          } catch { /* promo update is non-critical */ }
        }
      } catch (postBillErr: unknown) {
        try {
          await rollbackBill(bill.id);
        } catch {
          // cleanup failed — manual review needed
        }
        throw new Error(
          `Checkout partially failed — bill ${bill.bill_number} may need manual review. ` +
          (postBillErr instanceof Error ? postBillErr.message : 'Unknown error')
        );
      }

      toast.success(`Bill paid — ${formatPKR(total)}`);
      setBillNumber(bill.bill_number);
      setShowCheckout(false);

      // Reset
      setItems([]);
      setSelectedClient(null);
      setSelectedStaffId('');
      setDiscountType(null);
      setDiscountValue(0);
      setPromoCode('');
      setPromoDiscount(0);
      setLoyaltyPointsUsed(0);
      setPaymentMethod(null);
      setCashReceived(0);
      setReference('');
      setIsSplit(false);
      setSplitPayments([]);
      setTipAmount(0);
      setAppointmentId(null);
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSaving(false);
    }
  }

  const pointsEarned = Math.floor(total / 100) * 10;

  return (
    <div className="h-[calc(100dvh-3.5rem)] flex flex-col md:flex-row gap-0 -m-4 md:-m-6">
      {loading && (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center mx-auto mb-3 shimmer">
              <span className="text-gold font-bold">POS</span>
            </div>
            <p className="text-sm text-muted-foreground">Loading services...</p>
          </div>
        </div>
      )}
      {!loading && (<>
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border shrink-0 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="transition-all duration-150">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/pos/bills')} className="text-xs transition-all duration-150" title="Past bills">
            Bills
          </Button>

          {selectedClient ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gold/20 text-gold text-xs font-bold flex items-center justify-center shrink-0">
                {selectedClient.name.charAt(0)}
              </div>
              <span className="text-sm font-medium truncate">{selectedClient.name}</span>
              {selectedClient.is_vip && <Badge variant="outline" className="text-[10px] text-gold border-gold">VIP</Badge>}
              <Button variant="ghost" size="icon" className="h-6 w-6 transition-all duration-150" onClick={() => setSelectedClient(null)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : showNewClient ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Client name *"
                className="h-8 text-sm flex-1"
                autoFocus
              />
              <Input
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
                placeholder="Phone *"
                className="h-8 text-sm w-36"
              />
              <Button size="sm" className="h-8 text-xs bg-gold text-black border border-gold shrink-0 transition-all duration-150" onClick={createNewClient}>
                Save
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 transition-all duration-150" onClick={() => { setShowNewClient(false); setNewClientName(''); setNewClientPhone(''); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="relative flex-1 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search client..."
                  className="pl-8 h-8 text-sm"
                />
                {clientSearch.length >= 2 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                    {clientResults.map((c) => (
                      <button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(''); setClientResults([]); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-secondary text-sm transition-all duration-150"
                      >
                        {c.name} <span className="text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                    {clientResults.length === 0 && (
                      <button
                        onClick={() => openNewClientForm(clientSearch)}
                        className="w-full text-left px-3 py-2 hover:bg-secondary text-xs transition-all duration-150 flex items-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-gold shrink-0" />
                        <span className="text-muted-foreground">
                          {/\d/.test(clientSearch) ? (
                            <>Add new client with phone <span className="text-foreground font-medium">{clientSearch}</span></>
                          ) : (
                            <>Add <span className="text-foreground font-medium">&quot;{clientSearch}&quot;</span> as new client</>
                          )}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <Button size="sm" className="h-9 md:h-8 text-xs shrink-0 bg-gold hover:bg-gold/90 text-black border border-gold font-semibold px-3 sm:px-4 transition-all duration-150" onClick={() => openNewClientForm(clientSearch)}>
                <UserPlus className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">New Client</span>
              </Button>
            </div>
          )}

          <select value={selectedStaffId} onChange={(e) => { const v = e.target.value; if (v) setSelectedStaffId(v); }}
            className="h-10 sm:h-8 text-sm sm:text-xs w-full sm:w-[140px] order-last sm:order-none border border-border bg-background rounded-md px-2 basis-full sm:basis-auto">
              <option value="">Stylist</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
          </select>

          <span className="bg-background/50 px-3 py-1 text-xs text-muted-foreground font-mono hidden xl:block">{billNumber}</span>
        </div>

        <div className="flex-1 overflow-hidden bg-background">
          <BillBuilder
            services={services}
            products={products}
            packages={packages}
            items={items}
            onAddService={addService}
            onAddProduct={addProduct}
            onAddPackage={addPackage}
            onRemoveItem={removeItem}
            onUpdateItemPrice={updateItemPrice}
            onUpdateItemQty={updateItemQty}
            discountType={discountType}
            discountValue={discountValue}
            onSetDiscount={(type, val) => { setDiscountType(type); setDiscountValue(val); }}
            promoCode={promoCode}
            promoDiscount={promoDiscount}
            onApplyPromo={applyPromo}
            loyaltyPointsAvailable={selectedClient?.loyalty_points || 0}
            loyaltyPointsUsed={loyaltyPointsUsed}
            onSetLoyaltyPoints={setLoyaltyPointsUsed}
            subtotal={subtotal}
            totalDiscount={totalDiscount}
            taxAmount={taxAmount}
            total={total}
          />
        </div>
      </div>

      <div className="hidden xl:flex w-[320px] shrink-0 p-4 bg-card flex-col overflow-y-auto border-l border-border" style={{ scrollbarWidth: 'none' }}>
        <PaymentPanel
          total={total}
          clientUdhaarBalance={selectedClient?.udhaar_balance || 0}
          clientUdhaarLimit={selectedClient?.udhaar_limit || 5000}
          hasClient={!!selectedClient}
          hasStylist={!!selectedStaffId}
          selectedPaymentMethod={paymentMethod}
          onSelectMethod={setPaymentMethod}
          cashReceived={cashReceived}
          onCashReceived={setCashReceived}
          reference={reference}
          onReferenceChange={setReference}
          isSplit={isSplit}
          onSplitToggle={setIsSplit}
          splitPayments={splitPayments}
          onSplitPaymentsChange={setSplitPayments}
          tipAmount={tipAmount}
          onTipChange={setTipAmount}
          onCheckout={() => setShowCheckout(true)}
          saving={saving}
        />
      </div>

      {/* Mobile payment panel (full-screen overlay).
          Layout: fixed full-screen flex column. Header is fixed-height; body
          is flex-1 with overflow-y-auto so a long bill (many split methods,
          cash quick-buttons + tip + reference all stacked) can scroll all
          the way to the Checkout button at the bottom of PaymentPanel.
          Generous safe-area padding prevents iOS Safari bottom toolbar from
          clipping the Checkout button. */}
      {showMobilePayment && (
        <div className="xl:hidden fixed inset-0 z-50 bg-card flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
            <h2 className="text-sm font-semibold">Payment</h2>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowMobilePayment(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div
            className="flex-1 overflow-y-auto overscroll-contain p-4"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)',
              scrollbarWidth: 'none',
            }}
          >
            <PaymentPanel
              total={total}
              clientUdhaarBalance={selectedClient?.udhaar_balance || 0}
              clientUdhaarLimit={selectedClient?.udhaar_limit || 5000}
              hasClient={!!selectedClient}
              hasStylist={!!selectedStaffId}
                  selectedPaymentMethod={paymentMethod}
              onSelectMethod={setPaymentMethod}
              cashReceived={cashReceived}
              onCashReceived={setCashReceived}
              reference={reference}
              onReferenceChange={setReference}
              isSplit={isSplit}
              onSplitToggle={setIsSplit}
              splitPayments={splitPayments}
              onSplitPaymentsChange={setSplitPayments}
              tipAmount={tipAmount}
              onTipChange={setTipAmount}
              onCheckout={() => { setShowMobilePayment(false); setShowCheckout(true); }}
              saving={saving}
            />
          </div>
        </div>
      )}

      {/* Mobile checkout button - fixed above the bill bar + mobile bottom nav + safe-area */}
      {!loading && items.length > 0 && (
        <button
          onClick={() => setShowMobilePayment(true)}
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 8.25rem)' }}
          className="xl:hidden fixed md:!bottom-6 right-4 md:right-6 z-40 bg-gold text-black font-semibold px-5 py-3 rounded-lg shadow-lg active:scale-95 transition-all text-sm touch-target"
        >
          Checkout {formatPKR(total)}
        </button>
      )}
      </>)}

      <CheckoutConfirmation
        open={showCheckout}
        onClose={() => setShowCheckout(false)}
        onConfirm={handleConfirm}
        saving={saving}
        billNumber={billNumber}
        clientName={selectedClient?.name || 'Walk-in Guest'}
        clientPhone={selectedClient?.phone || ''}
        salonName={salon?.name || 'iCut'}
        salonAddress={currentBranch?.address || ''}
        items={items}
        subtotal={subtotal}
        discountAmount={totalDiscount}
        taxAmount={taxAmount}
        total={total}
        paymentMethod={(isSplit ? 'split' : paymentMethod) || ''}
        cashReceived={cashReceived}
        change={paymentMethod === 'cash' ? Math.max(0, cashReceived - (total + tipAmount)) : 0}
        pointsEarned={pointsEarned}
        tipAmount={tipAmount}
      />
    </div>
  );
}
