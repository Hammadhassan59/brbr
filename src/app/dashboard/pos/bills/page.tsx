'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Receipt, Eye, Printer, Download, MessageCircle, Loader2, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { listBills, type BillRow } from '@/app/actions/bills';
import { useAppStore } from '@/store/app-store';
import { BillReceiptPreview, printBillReceipt, type BillReceiptData } from '@/components/bill-receipt';
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
import { encodeMessage } from '@/lib/utils/whatsapp';
import { formatPKR } from '@/lib/utils/currency';

const RECEIPT_TEMPLATE = `*{salon_name}*
{salon_address}
─────────────────
Bill # {bill_number}
Date: {date}
─────────────────
{bill_items}
─────────────────
Subtotal:       {subtotal}
{discount_line}*TOTAL:          {total}*
Paid: {payment_method}
─────────────────
{points_line}Thank you! Please visit again.`;

function billToReceipt(b: BillRow, salonName: string, salonAddress: string): BillReceiptData {
  const date = new Date(b.created_at).toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return {
    salonName,
    salonAddress,
    billNumber: b.bill_number,
    date,
    clientName: b.client?.name || 'Walk-in',
    items: b.items.map((i) => ({ name: i.name, quantity: i.quantity, total_price: Number(i.total_price) })),
    subtotal: Number(b.subtotal),
    discountAmount: Number(b.discount_amount),
    taxAmount: Number(b.tax_amount),
    tipAmount: Number(b.tip_amount),
    total: Number(b.total_amount) - Number(b.tip_amount),
    paymentMethod: b.payment_method || 'cash',
    cashReceived: b.payment_method === 'cash' ? Number(b.paid_amount) : undefined,
    change: 0,
    pointsEarned: b.loyalty_points_earned,
  };
}

export default function BillsHistoryPage() {
  const { salon, currentBranch } = useAppStore();
  const { open: openWhatsApp } = useWhatsAppCompose();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [viewingBill, setViewingBill] = useState<BillRow | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!currentBranch) return;
    setLoading(true);
    const res = await listBills({
      branchId: currentBranch.id,
      search: search.trim() || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: 100,
    });
    if (res.error) {
      toast.error(res.error);
    } else {
      setBills(res.data);
      setTotal(res.total);
    }
    setLoading(false);
  }, [currentBranch, search, fromDate, toDate]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const salonName = salon?.name || 'iCut Salon';
  const salonAddress = (salon as { address?: string })?.address || currentBranch?.name || '';

  function handleView(b: BillRow) { setViewingBill(b); }

  function handlePrint(b: BillRow) {
    printBillReceipt(billToReceipt(b, salonName, salonAddress));
  }

  function handleDownload(b: BillRow) {
    // Same print window — the user picks "Save as PDF" in the print
    // destination dropdown. No extra library needed.
    printBillReceipt(billToReceipt(b, salonName, salonAddress));
    toast('In the print dialog, pick "Save as PDF" as destination.', { icon: 'ℹ️' });
  }

  function handleWhatsApp(b: BillRow) {
    if (!b.client?.phone) { toast.error('No phone number on file for this client'); return; }
    const date = new Date(b.created_at).toLocaleDateString('en-PK', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const itemLines = b.items.map((i) => `${i.name.padEnd(20)} ${formatPKR(Number(i.total_price))}`).join('\n');
    const discountLine = Number(b.discount_amount) > 0 ? `Discount:      -${formatPKR(Number(b.discount_amount))}\n` : '';
    const pointsLine = b.loyalty_points_earned > 0 ? `Points earned: +${b.loyalty_points_earned}\n\n` : '';
    const receiptText = encodeMessage(RECEIPT_TEMPLATE, {
      salon_name: salonName,
      salon_address: salonAddress,
      bill_number: b.bill_number,
      date,
      bill_items: itemLines,
      subtotal: formatPKR(Number(b.subtotal)),
      discount_line: discountLine,
      total: formatPKR(Number(b.total_amount)),
      payment_method: (b.payment_method || 'cash').replace('_', ' '),
      points_line: pointsLine,
    });
    openWhatsApp({
      recipient: { name: b.client.name || 'Customer', phone: b.client.phone },
      template: 'receipt',
      variables: { receipt_text: receiptText },
    });
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/pos" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="font-heading text-xl font-bold flex-1">Bills History</h2>
        <Badge variant="outline" className="text-xs">
          {total} total
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground mb-1 block">Search bill number</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="BB-20260420-001"
              className="pl-8"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">From</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">To</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
        </div>
        {(search || fromDate || toDate) && (
          <Button variant="outline" onClick={() => { setSearch(''); setFromDate(''); setToDate(''); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Bill #</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-left px-4 py-3 font-medium">Items</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-left px-4 py-3 font-medium">Payment</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : bills.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No bills yet. Close a POS transaction and it will show up here.
              </td></tr>
            ) : bills.map((b) => (
              <tr key={b.id} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="px-4 py-3 font-mono text-xs">{b.bill_number}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(b.created_at).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3">
                  <div>{b.client?.name || <span className="text-muted-foreground">Walk-in</span>}</div>
                  {b.client?.phone && <div className="text-[11px] text-muted-foreground">{b.client.phone}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{b.items.length} item{b.items.length !== 1 ? 's' : ''}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatPKR(Number(b.total_amount))}</td>
                <td className="px-4 py-3 text-xs capitalize">{(b.payment_method || 'cash').replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleView(b)} title="View"><Eye className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handlePrint(b)} title="Print"><Printer className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleDownload(b)} title="Download PDF"><Download className="w-3.5 h-3.5" /></Button>
                    {b.client?.phone && (
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleWhatsApp(b)} title="Resend via WhatsApp">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : bills.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No bills yet.
          </div>
        ) : bills.map((b) => (
          <div key={b.id} className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-mono text-xs">{b.bill_number}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(b.created_at).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatPKR(Number(b.total_amount))}</div>
                <div className="text-[11px] text-muted-foreground capitalize">{(b.payment_method || 'cash').replace('_', ' ')}</div>
              </div>
            </div>
            <div className="text-xs mb-2">{b.client?.name || 'Walk-in'} · {b.items.length} item{b.items.length !== 1 ? 's' : ''}</div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7 flex-1 gap-1" onClick={() => handleView(b)}><Eye className="w-3.5 h-3.5" />View</Button>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handlePrint(b)}><Printer className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleDownload(b)}><Download className="w-3.5 h-3.5" /></Button>
              {b.client?.phone && (
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleWhatsApp(b)}><MessageCircle className="w-3.5 h-3.5" /></Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Preview modal */}
      <Dialog open={!!viewingBill} onOpenChange={(v) => !v && setViewingBill(null)}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Bill {viewingBill?.bill_number}</DialogTitle>
          </DialogHeader>
          {viewingBill && (
            <>
              <BillReceiptPreview data={billToReceipt(viewingBill, salonName, salonAddress)} />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 gap-1" onClick={() => handlePrint(viewingBill)}>
                  <Printer className="w-3.5 h-3.5" /> Print
                </Button>
                <Button variant="outline" className="flex-1 gap-1" onClick={() => handleDownload(viewingBill)}>
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
                {viewingBill.client?.phone && (
                  <Button variant="outline" className="flex-1 gap-1" onClick={() => handleWhatsApp(viewingBill)}>
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
