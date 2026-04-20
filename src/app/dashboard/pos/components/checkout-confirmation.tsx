'use client';

import { Printer, MessageCircle, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatPKR } from '@/lib/utils/currency';
import { encodeMessage } from '@/lib/utils/whatsapp';
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
import type { BillLineItem } from './bill-builder';

interface CheckoutConfirmationProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  billNumber: string;
  clientName: string;
  clientPhone: string;
  salonName: string;
  salonAddress: string;
  items: BillLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
  cashReceived: number;
  change: number;
  pointsEarned: number;
  tipAmount: number;
}

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
Points earned: +{points_earned}

Thank you! Please visit again.`;

export function CheckoutConfirmation({
  open, onClose, onConfirm, saving,
  billNumber, clientName, clientPhone,
  salonName, salonAddress,
  items, subtotal, discountAmount, taxAmount, total,
  paymentMethod, cashReceived, change, pointsEarned, tipAmount,
}: CheckoutConfirmationProps) {
  const { open: openWhatsApp } = useWhatsAppCompose();

  const dateStr = new Date().toLocaleDateString('en-PK', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  function getReceiptText(): string {
    const itemLines = items.map((i) =>
      `${i.name.padEnd(20)} ${formatPKR(i.totalPrice)}`
    ).join('\n');

    const discountLine = discountAmount > 0 ? `Discount:      -${formatPKR(discountAmount)}\n` : '';

    return encodeMessage(RECEIPT_TEMPLATE, {
      salon_name: salonName,
      salon_address: salonAddress,
      bill_number: billNumber,
      date: dateStr,
      bill_items: itemLines,
      subtotal: formatPKR(subtotal),
      discount_line: discountLine,
      total: formatPKR(total),
      payment_method: paymentMethod.replace('_', ' '),
      points_earned: String(pointsEarned),
    });
  }

  function sendWhatsAppReceipt() {
    if (!clientPhone) return;
    openWhatsApp({
      recipient: { name: clientName || 'Customer', phone: clientPhone },
      template: 'receipt',
      variables: { receipt_text: getReceiptText() },
    });
  }

  function printReceipt() {
    const el = document.getElementById('print-receipt');
    if (!el) return;
    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (!printWindow) return;
    const doc = printWindow.document;
    const style = doc.createElement('style');
    style.textContent = [
      '* { margin: 0; padding: 0; box-sizing: border-box; }',
      'body { width: 80mm; padding: 4mm; font-family: "Courier New", Courier, monospace; font-size: 11px; line-height: 1.5; color: #000; background: #fff; }',
      '.receipt-divider { border-top: 1px dashed #000; margin: 4px 0; }',
      '.receipt-total { font-size: 14px; font-weight: bold; }',
      '@page { size: 80mm auto; margin: 0; }',
    ].join('\n');
    doc.head.appendChild(style);
    doc.title = 'Receipt';
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.position = 'static';
    clone.style.left = 'auto';
    doc.body.appendChild(clone);
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md bg-card border-border max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-heading text-center">Checkout Summary</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
            <div className="text-center text-sm">
              <p>Bill # <span className="font-mono font-medium">{billNumber}</span></p>
              <p className="text-muted-foreground">{clientName || 'Walk-in Guest'}</p>
            </div>

            <Separator />

            <div className="bg-card border border-border rounded-lg p-4 space-y-0">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm py-2 border-b border-border/20 last:border-0">
                  <span>{item.name} {item.quantity > 1 ? `×${item.quantity}` : ''}</span>
                  <span>{formatPKR(item.totalPrice)}</span>
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatPKR(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>Discount</span>
                  <span>-{formatPKR(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>GST</span>
                  <span>{formatPKR(taxAmount)}</span>
                </div>
              )}
              {tipAmount > 0 && (
                <div className="flex justify-between">
                  <span>Tip</span>
                  <span>{formatPKR(tipAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold pt-1">
                <span>Total</span>
                <span>{formatPKR(total + tipAmount)}</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Payment</span>
                <span className="capitalize">{paymentMethod.replace('_', ' ')}</span>
              </div>
              {paymentMethod === 'cash' && cashReceived > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Cash received</span>
                    <span>{formatPKR(cashReceived)}</span>
                  </div>
                  {change > 0 && (
                    <div className="flex justify-between text-green-400 font-medium">
                      <span>Change</span>
                      <span>{formatPKR(change)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-gold">
                <span>Points earned</span>
                <span>+{pointsEarned} pts</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1 text-xs transition-all duration-150" onClick={printReceipt}>
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              {clientPhone && (
                <Button variant="outline" className="flex-1 gap-1 text-xs transition-all duration-150" onClick={sendWhatsAppReceipt}>
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </Button>
              )}
            </div>

            <Button
              onClick={onConfirm}
              disabled={saving}
              className="w-full h-12 bg-green-500 hover:bg-green-600 text-white text-lg font-bold gap-2 transition-all duration-150"
            >
              <Check className="w-5 h-5" /> {saving ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div id="print-receipt" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 'bold', letterSpacing: 2 }}>{salonName.toUpperCase()}</div>
          {salonAddress && <div style={{ fontSize: 10 }}>{salonAddress}</div>}
          <div style={{ fontSize: 10, marginTop: 2 }}>Pakistan&apos;s Smart Salon System</div>
        </div>

        <div className="receipt-divider" />

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Bill #</span>
            <span>{billNumber}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Date</span>
            <span>{dateStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Client</span>
            <span>{clientName || 'Walk-in'}</span>
          </div>
        </div>

        <div className="receipt-divider" />

        <div>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
              <span>{item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}</span>
              <span>{formatPKR(item.totalPrice)}</span>
            </div>
          ))}
        </div>

        <div className="receipt-divider" />

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal</span>
            <span>{formatPKR(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount</span>
              <span>-{formatPKR(discountAmount)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>GST</span>
              <span>{formatPKR(taxAmount)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tip</span>
              <span>{formatPKR(tipAmount)}</span>
            </div>
          )}
        </div>

        <div className="receipt-divider" />

        <div className="receipt-total" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span>TOTAL</span>
          <span>{formatPKR(total + tipAmount)}</span>
        </div>

        <div className="receipt-divider" />

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Paid via</span>
            <span style={{ textTransform: 'capitalize' }}>{paymentMethod.replace('_', ' ')}</span>
          </div>
          {paymentMethod === 'cash' && cashReceived > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cash</span>
                <span>{formatPKR(cashReceived)}</span>
              </div>
              {change > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Change</span>
                  <span>{formatPKR(change)}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="receipt-divider" />

        <div style={{ textAlign: 'center', fontSize: 10, paddingTop: 4 }}>
          {pointsEarned > 0 && <div>★ Points earned: +{pointsEarned}</div>}
          <div style={{ marginTop: 6 }}>Thank you for visiting!</div>
          <div>Please come again</div>
          <div style={{ marginTop: 6, fontSize: 9, letterSpacing: 1 }}>— ICUT.PK —</div>
        </div>
      </div>
    </>
  );
}
