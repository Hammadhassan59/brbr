import { formatPKR } from '@/lib/utils/currency';

/**
 * Printable receipt markup for a POS bill. Shared between the live
 * checkout flow and the bills history page so a reprinted receipt
 * matches what was originally handed to the client.
 *
 * The component renders 80mm-thermal-printer-optimised styles inline so it
 * can be cloned into a blank popup window for printing (or Save-as-PDF)
 * without pulling in the app's global CSS.
 */

export interface BillReceiptData {
  salonName: string;
  salonAddress: string;
  billNumber: string;
  date: string;               // pre-formatted
  clientName: string;
  items: Array<{ name: string; quantity: number; total_price: number }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  pointsEarned?: number;
}

/**
 * Same visual layout as the printed thermal receipt but with app-styled
 * divs so it can be shown inside a dialog (the bills-history "View"
 * button uses this form).
 */
export function BillReceiptPreview({ data }: { data: BillReceiptData }) {
  return (
    <div className="font-mono text-xs bg-white text-black p-4 rounded-lg border leading-relaxed">
      <div className="text-center mb-2">
        <div className="text-base font-bold tracking-widest">{data.salonName.toUpperCase()}</div>
        {data.salonAddress && <div className="text-[10px]">{data.salonAddress}</div>}
        <div className="text-[10px] mt-0.5">Pakistan&apos;s Smart Salon System</div>
      </div>
      <div className="border-t border-dashed border-black my-1.5" />
      <div className="flex justify-between"><span>Bill #</span><span>{data.billNumber}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{data.date}</span></div>
      <div className="flex justify-between"><span>Client</span><span>{data.clientName || 'Walk-in'}</span></div>
      <div className="border-t border-dashed border-black my-1.5" />
      {data.items.map((i, idx) => (
        <div key={idx} className="flex justify-between py-0.5">
          <span className="truncate pr-2">{i.quantity > 1 ? `${i.quantity}x ` : ''}{i.name}</span>
          <span>{formatPKR(i.total_price)}</span>
        </div>
      ))}
      <div className="border-t border-dashed border-black my-1.5" />
      <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(data.subtotal)}</span></div>
      {data.discountAmount > 0 && (
        <div className="flex justify-between"><span>Discount</span><span>-{formatPKR(data.discountAmount)}</span></div>
      )}
      {data.taxAmount > 0 && (
        <div className="flex justify-between"><span>GST</span><span>{formatPKR(data.taxAmount)}</span></div>
      )}
      {data.tipAmount > 0 && (
        <div className="flex justify-between"><span>Tip</span><span>{formatPKR(data.tipAmount)}</span></div>
      )}
      <div className="border-t border-dashed border-black my-1.5" />
      <div className="flex justify-between font-bold text-sm py-1">
        <span>TOTAL</span>
        <span>{formatPKR(data.total + data.tipAmount)}</span>
      </div>
      <div className="border-t border-dashed border-black my-1.5" />
      <div className="flex justify-between"><span>Paid via</span><span className="capitalize">{data.paymentMethod.replace('_', ' ')}</span></div>
      {data.paymentMethod === 'cash' && data.cashReceived && data.cashReceived > 0 && (
        <>
          <div className="flex justify-between"><span>Cash</span><span>{formatPKR(data.cashReceived)}</span></div>
          {data.change && data.change > 0 && (
            <div className="flex justify-between"><span>Change</span><span>{formatPKR(data.change)}</span></div>
          )}
        </>
      )}
      <div className="border-t border-dashed border-black my-1.5" />
      <div className="text-center text-[10px] pt-1">
        {data.pointsEarned && data.pointsEarned > 0 ? <div>★ Points earned: +{data.pointsEarned}</div> : null}
        <div className="mt-1">Thank you for visiting!</div>
        <div>Please come again</div>
        <div className="mt-1 tracking-widest">— ICUT.PK —</div>
      </div>
    </div>
  );
}

/**
 * Triggers the browser print dialog with the same receipt rendered at
 * 80mm thermal-printer width. "Download" works by selecting "Save as PDF"
 * from the native print dialog destination picker.
 */
export function printBillReceipt(data: BillReceiptData): void {
  const w = window.open('', '_blank', 'width=340,height=640');
  if (!w) return;
  const html = `<!doctype html><html><head><title>Receipt ${data.billNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:80mm;padding:4mm;font-family:"Courier New",Courier,monospace;font-size:11px;line-height:1.5;color:#000;background:#fff}
  .d{border-top:1px dashed #000;margin:4px 0}
  .r{display:flex;justify-content:space-between;padding:1px 0}
  .t{font-size:14px;font-weight:bold}
  .c{text-align:center}
  @page{size:80mm auto;margin:0}
</style></head><body>
<div class="c">
  <div style="font-size:16px;font-weight:bold;letter-spacing:2px">${escapeHtml(data.salonName.toUpperCase())}</div>
  ${data.salonAddress ? `<div style="font-size:10px">${escapeHtml(data.salonAddress)}</div>` : ''}
  <div style="font-size:10px;margin-top:2px">Pakistan's Smart Salon System</div>
</div>
<div class="d"></div>
<div class="r"><span>Bill #</span><span>${escapeHtml(data.billNumber)}</span></div>
<div class="r"><span>Date</span><span>${escapeHtml(data.date)}</span></div>
<div class="r"><span>Client</span><span>${escapeHtml(data.clientName || 'Walk-in')}</span></div>
<div class="d"></div>
${data.items.map(i => `<div class="r"><span>${i.quantity > 1 ? `${i.quantity}x ` : ''}${escapeHtml(i.name)}</span><span>${formatPKR(i.total_price)}</span></div>`).join('')}
<div class="d"></div>
<div class="r"><span>Subtotal</span><span>${formatPKR(data.subtotal)}</span></div>
${data.discountAmount > 0 ? `<div class="r"><span>Discount</span><span>-${formatPKR(data.discountAmount)}</span></div>` : ''}
${data.taxAmount > 0 ? `<div class="r"><span>GST</span><span>${formatPKR(data.taxAmount)}</span></div>` : ''}
${data.tipAmount > 0 ? `<div class="r"><span>Tip</span><span>${formatPKR(data.tipAmount)}</span></div>` : ''}
<div class="d"></div>
<div class="r t"><span>TOTAL</span><span>${formatPKR(data.total + data.tipAmount)}</span></div>
<div class="d"></div>
<div class="r"><span>Paid via</span><span style="text-transform:capitalize">${escapeHtml(data.paymentMethod.replace('_', ' '))}</span></div>
${data.paymentMethod === 'cash' && (data.cashReceived ?? 0) > 0 ? `<div class="r"><span>Cash</span><span>${formatPKR(data.cashReceived!)}</span></div>` : ''}
${data.paymentMethod === 'cash' && (data.change ?? 0) > 0 ? `<div class="r"><span>Change</span><span>${formatPKR(data.change!)}</span></div>` : ''}
<div class="d"></div>
<div class="c" style="font-size:10px;padding-top:4px">
  ${(data.pointsEarned ?? 0) > 0 ? `<div>★ Points earned: +${data.pointsEarned}</div>` : ''}
  <div style="margin-top:6px">Thank you for visiting!</div>
  <div>Please come again</div>
  <div style="margin-top:6px;font-size:9px;letter-spacing:1px">— ICUT.PK —</div>
</div>
<script>setTimeout(()=>{window.print();setTimeout(()=>window.close(),300)},250)</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;'
  ));
}
