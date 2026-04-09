'use client';

import { useState } from 'react';
import { Banknote, Smartphone, Building2, CreditCard, BookOpen, Split } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPKR } from '@/lib/utils/currency';
import type { PaymentMethod } from '@/types/database';
import type { Staff } from '@/types/database';

export interface SplitPaymentEntry {
  method: PaymentMethod;
  amount: number;
}

interface PaymentPanelProps {
  total: number;
  clientUdhaarBalance: number;
  clientUdhaarLimit: number;
  hasClient: boolean;
  stylists: Staff[];
  selectedPaymentMethod: PaymentMethod | null;
  onSelectMethod: (method: PaymentMethod) => void;
  cashReceived: number;
  onCashReceived: (amount: number) => void;
  reference: string;
  onReferenceChange: (ref: string) => void;
  isSplit: boolean;
  onSplitToggle: (on: boolean) => void;
  splitPayments: SplitPaymentEntry[];
  onSplitPaymentsChange: (entries: SplitPaymentEntry[]) => void;
  tipAmount: number;
  onTipChange: (amount: number) => void;
  tipStaffId: string;
  onTipStaffChange: (id: string) => void;
  onCheckout: () => void;
  saving: boolean;
}

const PAYMENT_METHODS: { method: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { method: 'cash', label: 'Cash', icon: Banknote },
  { method: 'jazzcash', label: 'JazzCash', icon: Smartphone },
  { method: 'easypaisa', label: 'EasyPaisa', icon: Smartphone },
  { method: 'bank_transfer', label: 'Bank/IBFT', icon: Building2 },
  { method: 'card', label: 'Card', icon: CreditCard },
  { method: 'udhaar', label: 'Udhaar', icon: BookOpen },
];

export function PaymentPanel({
  total, clientUdhaarBalance, clientUdhaarLimit, hasClient, stylists,
  selectedPaymentMethod, onSelectMethod, cashReceived, onCashReceived,
  reference, onReferenceChange,
  isSplit, onSplitToggle, splitPayments, onSplitPaymentsChange,
  tipAmount, onTipChange, tipStaffId, onTipStaffChange,
  onCheckout, saving,
}: PaymentPanelProps) {
  const [showTip, setShowTip] = useState(false);

  const change = selectedPaymentMethod === 'cash' ? Math.max(0, cashReceived - total) : 0;
  const udhaarAfter = clientUdhaarBalance + total;
  const overLimit = udhaarAfter > clientUdhaarLimit;

  const splitTotal = splitPayments.reduce((sum, s) => sum + s.amount, 0);
  const splitRemaining = total - splitTotal;

  function addSplitRow() {
    onSplitPaymentsChange([...splitPayments, { method: 'cash', amount: 0 }]);
  }

  function updateSplit(index: number, field: keyof SplitPaymentEntry, value: string | number) {
    const updated = [...splitPayments];
    if (field === 'method') updated[index] = { ...updated[index], method: value as PaymentMethod };
    else updated[index] = { ...updated[index], amount: Number(value) };
    onSplitPaymentsChange(updated);
  }

  function removeSplit(index: number) {
    onSplitPaymentsChange(splitPayments.filter((_, i) => i !== index));
  }

  const hasItems = total > 0;

  return (
    <div className="flex flex-col h-full">
      {!hasItems ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="w-14 h-14 rounded-lg bg-gold/10 flex items-center justify-center mb-4">
            <Banknote className="w-7 h-7 text-gold" />
          </div>
          <p className="font-heading font-semibold text-base mb-1">Ready for checkout</p>
          <p className="text-sm text-muted-foreground max-w-[220px] mb-6">
            Select services from the left panel to start building the bill
          </p>
          <div className="w-full max-w-[200px] space-y-2 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground text-xs mb-1">Keyboard shortcuts</p>
            <div className="flex justify-between"><span>Cash payment</span><kbd className="px-1.5 py-0.5 bg-secondary border text-[10px] font-mono">C</kbd></div>
            <div className="flex justify-between"><span>JazzCash</span><kbd className="px-1.5 py-0.5 bg-secondary border text-[10px] font-mono">J</kbd></div>
            <div className="flex justify-between"><span>Checkout</span><kbd className="px-1.5 py-0.5 bg-secondary border text-[10px] font-mono">Enter</kbd></div>
            <div className="flex justify-between"><span>Back to dashboard</span><kbd className="px-1.5 py-0.5 bg-secondary border text-[10px] font-mono">Esc</kbd></div>
          </div>
        </div>
      ) : (
      <>
      <div className="text-center mb-4">
        <p className="text-xs text-muted-foreground mb-1">Total Due</p>
        <p className="text-4xl font-heading font-bold"><span className="text-gold">{formatPKR(total)}</span></p>
      </div>

      <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
        <Switch checked={isSplit} onCheckedChange={onSplitToggle} />
        <Split className="w-3.5 h-3.5" /> Split Payment
      </label>

      {isSplit ? (
        <div className="space-y-2 mb-4 flex-1">
          {splitPayments.map((sp, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-3 flex items-center gap-1.5">
              <Select value={sp.method} onValueChange={(v) => { if (v) updateSplit(i, 'method', v); }}>
                <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.method} value={m.method}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={sp.amount || ''}
                onChange={(e) => updateSplit(i, 'amount', e.target.value)}
                className="h-8 text-xs flex-1"
                placeholder="Rs 0"
                inputMode="numeric"
              />
              <button onClick={() => removeSplit(i)} className="text-muted-foreground hover:text-destructive text-xs transition-all duration-150">×</button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={addSplitRow}>
            + Add Method
          </Button>
          <p className={`text-xs text-center font-medium ${Math.abs(splitRemaining) < 1 ? 'text-green-600' : 'text-destructive'}`}>
            {Math.abs(splitRemaining) < 1 ? 'Balanced ✓' : `Remaining: ${formatPKR(splitRemaining)}`}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {PAYMENT_METHODS.map((m) => {
              const isActive = selectedPaymentMethod === m.method;
              const disabled = m.method === 'udhaar' && !hasClient;
              return (
                <button
                  key={m.method}
                  onClick={() => !disabled && onSelectMethod(m.method)}
                  disabled={disabled}
                  className={`bg-card border border-border rounded-lg flex flex-col items-center gap-1 p-4 h-auto text-xs font-medium transition-all duration-150 touch-target ${
                    isActive
                      ? 'border-gold bg-gold/10 text-foreground'
                      : disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:border-gold/30'
                  }`}
                >
                  <m.icon className="w-5 h-5" />
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-3 mb-4 flex-1">
            {selectedPaymentMethod === 'cash' && (
              <div>
                <Label className="text-xs">Cash Received</Label>
                <Input
                  type="number"
                  value={cashReceived || ''}
                  onChange={(e) => onCashReceived(Number(e.target.value))}
                  placeholder="Rs 0"
                  className="mt-1 text-2xl font-bold h-14"
                  inputMode="numeric"
                  autoFocus
                />
                <div className="flex gap-1.5 mt-2">
                  {[500, 1000, 2000, 5000].map((v) => (
                    <Button key={v} variant="outline" size="sm" className="bg-card border border-border rounded-lg flex-1 text-xs h-10 transition-all duration-150" onClick={() => onCashReceived(v)}>
                      Rs {v.toLocaleString()}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="bg-card border border-border rounded-lg flex-1 text-xs h-10 border-gold text-gold transition-all duration-150" onClick={() => onCashReceived(total)}>
                    Exact
                  </Button>
                </div>
                {cashReceived > 0 && change > 0 && (
                  <div className="bg-green-500/10 border border-green-500/20 p-3 text-center mt-2">
                    <p className="text-green-400 text-xl font-bold">
                      Change: {formatPKR(change)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {(selectedPaymentMethod === 'jazzcash' || selectedPaymentMethod === 'easypaisa') && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Account: Salon&apos;s {selectedPaymentMethod === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'} number
                </p>
                <Label className="text-xs">Reference # (optional)</Label>
                <Input value={reference} onChange={(e) => onReferenceChange(e.target.value)} placeholder="Transaction ID" className="mt-1" />
              </div>
            )}

            {selectedPaymentMethod === 'bank_transfer' && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Bank account details from settings</p>
                <Label className="text-xs">Reference #</Label>
                <Input value={reference} onChange={(e) => onReferenceChange(e.target.value)} placeholder="IBFT reference" className="mt-1" />
              </div>
            )}

            {selectedPaymentMethod === 'udhaar' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Current balance</span>
                  <span>{formatPKR(clientUdhaarBalance)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>After this bill</span>
                  <span className={overLimit ? 'text-destructive' : ''}>{formatPKR(udhaarAfter)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Limit</span>
                  <span>{formatPKR(clientUdhaarLimit)}</span>
                </div>
                {overLimit && (
                  <p className="text-xs text-destructive font-medium p-3 bg-red-500/5 border border-red-500/20">
                    Warning: This exceeds the client&apos;s udhaar limit!
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={() => setShowTip(!showTip)}
        className="text-xs text-muted-foreground hover:text-foreground mb-2 transition-all duration-150"
      >
        {showTip ? 'Hide tip' : '+ Add tip'}
      </button>

      {showTip && (
        <div className="bg-background/50 border border-border/20 space-y-2 mb-3 p-3">
          <div>
            <Label className="text-xs">Tip Amount</Label>
            <div className="flex gap-1.5 mt-1">
              <Input
                type="number"
                value={tipAmount || ''}
                onChange={(e) => onTipChange(Number(e.target.value))}
                className="h-8 text-sm flex-1"
                inputMode="numeric"
              />
              {[50, 100, 200].map((v) => (
                <Button key={v} variant="outline" size="sm" className="h-8 text-xs transition-all duration-150" onClick={() => onTipChange(v)}>
                  Rs{v}
                </Button>
              ))}
            </div>
          </div>
          {stylists.length > 0 && (
            <div>
              <Label className="text-xs">Assign tip to</Label>
              <Select value={tipStaffId} onValueChange={(v) => { if (v) onTipStaffChange(v); }}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select stylist" /></SelectTrigger>
                <SelectContent>
                  {stylists.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <Button
        onClick={onCheckout}
        disabled={saving || total <= 0 || (!isSplit && !selectedPaymentMethod) || (isSplit && Math.abs(splitRemaining) >= 0.5)}
        className="w-full h-14 text-lg font-bold bg-gold hover:bg-gold/90 text-black border border-gold touch-target mt-auto transition-all duration-150"
      >
        {saving ? 'Processing...' : `Checkout · ${formatPKR(total)}`}
      </Button>
      </>
      )}
    </div>
  );
}
