'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Copy } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import type { PromoCode, DiscountType } from '@/types/database';

export default function PromosPage() {
  const { salon } = useAppStore();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPromo, setEditPromo] = useState<PromoCode | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formDiscountType, setFormDiscountType] = useState<DiscountType>('percentage');
  const [formDiscountValue, setFormDiscountValue] = useState('');
  const [formMinBill, setFormMinBill] = useState('');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formExpiry, setFormExpiry] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const { data } = await supabase.from('promo_codes').select('*').eq('salon_id', salon.id).order('created_at', { ascending: false });
    if (data) setPromos(data as PromoCode[]);
    setLoading(false);
  }, [salon]);

  useEffect(() => { fetch(); }, [fetch]);

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'BRBR-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setFormCode(code);
  }

  function openForm(promo?: PromoCode) {
    if (promo) {
      setEditPromo(promo); setFormCode(promo.code);
      setFormDiscountType(promo.discount_type || 'percentage'); setFormDiscountValue(String(promo.discount_value));
      setFormMinBill(String(promo.min_bill_amount || '')); setFormMaxUses(String(promo.max_uses || ''));
      setFormExpiry(promo.expiry_date || ''); setFormActive(promo.is_active);
    } else {
      setEditPromo(null); generateCode();
      setFormDiscountType('percentage'); setFormDiscountValue(''); setFormMinBill('');
      setFormMaxUses(''); setFormExpiry(''); setFormActive(true);
    }
    setShowForm(true);
  }

  async function savePromo() {
    if (!salon || !formCode || !formDiscountValue) { toast.error('Code and discount required'); return; }
    if (Number(formDiscountValue) <= 0) { toast.error('Discount must be positive'); return; }
    setSaving(true);
    try {
      const data = {
        salon_id: salon.id, code: formCode.toUpperCase(), discount_type: formDiscountType,
        discount_value: Number(formDiscountValue), min_bill_amount: Number(formMinBill) || 0,
        max_uses: formMaxUses ? Number(formMaxUses) : null, expiry_date: formExpiry || null, is_active: formActive,
      };
      if (editPromo) {
        await supabase.from('promo_codes').update(data).eq('id', editPromo.id);
        toast.success('Promo updated');
      } else {
        data.salon_id = salon.id;
        await supabase.from('promo_codes').insert({ ...data, used_count: 0 });
        toast.success('Promo created');
      }
      setShowForm(false); fetch();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  function isExpired(p: PromoCode) {
    if (!p.expiry_date) return false;
    const expiry = new Date(p.expiry_date);
    expiry.setHours(23, 59, 59, 999);
    return expiry < new Date();
  }
  function isExhausted(p: PromoCode) { return p.max_uses !== null && p.used_count >= (p.max_uses || 0); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Promo Codes</h2>
        <Button onClick={() => openForm()} className="bg-gold text-black border border-gold" size="sm"><Plus className="w-4 h-4 mr-1" /> Create Promo</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : promos.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No promo codes yet</p>
      ) : (
        <div className="space-y-3">
          {promos.map((p) => (
            <Card key={p.id} className={`cursor-pointer hover:shadow-md ${(!p.is_active || isExpired(p) || isExhausted(p)) ? 'opacity-60' : ''}`} onClick={() => openForm(p)}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-20 h-12 rounded-lg bg-gold/10 text-gold font-mono font-bold text-sm flex items-center justify-center shrink-0">
                  {p.code}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {p.discount_type === 'flat' ? formatPKR(p.discount_value) : `${p.discount_value}%`} OFF
                    </p>
                    {!p.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    {isExpired(p) && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                    {isExhausted(p) && <Badge variant="secondary" className="text-[10px]">Exhausted</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {p.min_bill_amount > 0 && <span>Min: {formatPKR(p.min_bill_amount)}</span>}
                    <span>Used: {p.used_count}{p.max_uses ? `/${p.max_uses}` : ''}</span>
                    {p.expiry_date && <span>Expires: {formatPKDate(p.expiry_date)}</span>}
                  </div>
                </div>
                <button onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(p.code);
                    toast.success('Copied!');
                  } catch {
                    // Fallback for HTTP or unsupported browsers
                    try {
                      const textarea = document.createElement('textarea');
                      textarea.value = p.code;
                      textarea.style.position = 'fixed';
                      textarea.style.opacity = '0';
                      document.body.appendChild(textarea);
                      textarea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textarea);
                      toast.success('Copied!');
                    } catch {
                      toast(`Code: ${p.code}`, { icon: '📋' });
                    }
                  }
                }} className="text-muted-foreground hover:text-foreground">
                  <Copy className="w-4 h-4" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editPromo ? 'Edit Promo' : 'Create Promo'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Code</Label>
              <div className="flex gap-1.5 mt-1">
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value.toUpperCase())} className="flex-1 font-mono" placeholder="EID2025" />
                <Button variant="outline" size="sm" onClick={generateCode} className="text-xs">Generate</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Discount Type</Label>
                <Select value={formDiscountType} onValueChange={(v) => { if (v) setFormDiscountType(v as DiscountType); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat (Rs)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">{formDiscountType === 'percentage' ? 'Discount (%)' : 'Discount (Rs)'}</Label>
                <Input type="number" value={formDiscountValue} onChange={(e) => setFormDiscountValue(e.target.value)} className="mt-1" inputMode="numeric" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Min Bill (Rs)</Label><Input type="number" value={formMinBill} onChange={(e) => setFormMinBill(e.target.value)} placeholder="0" className="mt-1" inputMode="numeric" /></div>
              <div><Label className="text-xs">Max Uses</Label><Input type="number" value={formMaxUses} onChange={(e) => setFormMaxUses(e.target.value)} placeholder="Unlimited" className="mt-1" inputMode="numeric" /></div>
            </div>
            <div><Label className="text-xs">Expiry Date</Label><Input type="date" value={formExpiry} onChange={(e) => setFormExpiry(e.target.value)} className="mt-1" /></div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm">Active</span><Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
            <Button onClick={savePromo} disabled={saving} className="w-full bg-gold text-black border border-gold">{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
