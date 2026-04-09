'use client';

import { useState, useEffect } from 'react';
import { Search, X, Plus, Minus, Tag, ShoppingBag, Package, Receipt } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import { Separator } from '@/components/ui/separator';
import { formatPKR } from '@/lib/utils/currency';
import type { Service, Product, Package as PkgType } from '@/types/database';

export interface BillLineItem {
  id: string;
  type: 'service' | 'product';
  serviceId?: string;
  productId?: string;
  name: string;
  stylistName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface BillBuilderProps {
  services: Service[];
  products: Product[];
  packages: PkgType[];
  items: BillLineItem[];
  onAddService: (service: Service) => void;
  onAddProduct: (product: Product) => void;
  onAddPackage: (pkg: PkgType) => void;
  onRemoveItem: (id: string) => void;
  onUpdateItemPrice: (id: string, price: number) => void;
  onUpdateItemQty: (id: string, qty: number) => void;
  // Discounts
  discountType: 'flat' | 'percentage' | null;
  discountValue: number;
  onSetDiscount: (type: 'flat' | 'percentage' | null, value: number) => void;
  promoCode: string;
  promoDiscount: number;
  onApplyPromo: (code: string) => void;
  loyaltyPointsAvailable: number;
  loyaltyPointsUsed: number;
  onSetLoyaltyPoints: (points: number) => void;
  // Totals
  subtotal: number;
  totalDiscount: number;
  taxAmount: number;
  total: number;
}

const SERVICE_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'haircut', label: 'Haircut' },
  { value: 'color', label: 'Color' },
  { value: 'facial', label: 'Facial' },
  { value: 'waxing', label: 'Waxing' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'bridal', label: 'Bridal' },
  { value: 'beard', label: 'Beard' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS: Record<string, string> = {
  haircut: 'border-t-blue-500',
  color: 'border-t-purple-500',
  facial: 'border-t-pink-500',
  waxing: 'border-t-amber-500',
  treatment: 'border-t-teal-500',
  bridal: 'border-t-rose-500',
  beard: 'border-t-indigo-500',
  nails: 'border-t-red-500',
  massage: 'border-t-green-500',
  other: 'border-t-gray-400',
};

export function BillBuilder({
  services, products, packages, items,
  onAddService, onAddProduct, onAddPackage, onRemoveItem, onUpdateItemPrice, onUpdateItemQty,
  discountType, discountValue, onSetDiscount,
  promoCode, promoDiscount, onApplyPromo,
  loyaltyPointsAvailable, loyaltyPointsUsed, onSetLoyaltyPoints,
  subtotal, totalDiscount, taxAmount, total,
}: BillBuilderProps) {
  const [svcSearch, setSvcSearch] = useState('');
  const [svcCategory, setSvcCategory] = useState('all');
  const [prodSearch, setProdSearch] = useState('');
  const [showProducts, setShowProducts] = useState(false);
  const [showPackages, setShowPackages] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [promoInput, setPromoInput] = useState(promoCode);
  useEffect(() => { setPromoInput(promoCode); }, [promoCode]);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);

  const filteredServices = services.filter((s) => {
    const matchCat = svcCategory === 'all' || s.category === svcCategory;
    const matchSearch = !svcSearch || s.name.toLowerCase().includes(svcSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const filteredProducts = products.filter((p) =>
    p.inventory_type === 'retail' && (!prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()))
  );

  return (
    <div className="flex h-full gap-0">
      <div className="flex-1 flex flex-col min-w-0 bg-background border-r border-border">
        <div className="px-3 pt-2 pb-1">
          <div className="flex flex-wrap gap-1">
            {SERVICE_TABS.map((t) => (
              <button key={t.value} onClick={() => setSvcCategory(t.value)}
                className={`text-[11px] px-2.5 py-1.5 font-medium rounded-md transition-all duration-150 ${
                  svcCategory === t.value ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={svcSearch}
              onChange={(e) => setSvcSearch(e.target.value)}
              placeholder="Search services..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ scrollbarWidth: 'none' }}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {filteredServices.map((svc) => (
              <button
                key={svc.id}
                onClick={() => onAddService(svc)}
                className={`aspect-square flex flex-col items-center justify-center text-center bg-card border border-border rounded-lg p-2.5 hover:border-gold/30 hover:bg-gold/5 active:scale-[0.97] transition-all duration-150 touch-target border-t-[3px] ${CATEGORY_COLORS[svc.category] || 'border-t-gray-400'}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{svc.category}</p>
                <p className="text-sm font-semibold leading-tight">{svc.name}</p>
                <p className="text-xs text-muted-foreground mt-1.5">{formatPKR(svc.base_price)}</p>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <button
              onClick={() => setShowProducts(!showProducts)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 px-2.5 transition-all duration-150"
            >
              <ShoppingBag className="w-3 h-3" /> {showProducts ? 'Hide Products' : '+ Add Product'}
            </button>

            {showProducts && (
              <div className="space-y-2 mt-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} placeholder="Search retail products..." className="pl-8 h-8 text-sm" />
                </div>
                <div className="space-y-1 max-h-[120px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {filteredProducts.map((prod) => (
                    <button key={prod.id} onClick={() => onAddProduct(prod)} className="w-full text-left p-2 bg-card border border-border rounded-lg text-xs hover:border-gold/30 flex items-center justify-between transition-all duration-150">
                      <div>
                        <p className="font-medium">{prod.name}</p>
                        <p className="text-muted-foreground">{prod.brand} · Stock: {prod.current_stock}</p>
                      </div>
                      <span>{formatPKR(prod.retail_price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {packages.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowPackages(!showPackages)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 px-2.5 transition-all duration-150"
              >
                <Package className="w-3 h-3" /> {showPackages ? 'Hide Packages' : '+ Add Package'}
              </button>

              {showPackages && (
                <div className="space-y-1 mt-2 max-h-[120px] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {packages.map((pkg) => {
                    const svcList = (pkg.services as unknown as { serviceName: string; quantity: number }[]) || [];
                    return (
                      <button key={pkg.id} onClick={() => onAddPackage(pkg)} className="w-full text-left p-3 bg-card border border-border rounded-lg text-xs hover:border-gold/30 transition-all duration-150">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{pkg.name}</p>
                          <span className="font-bold text-gold">{formatPKR(pkg.price)}</span>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{svcList.map(s => `${s.quantity}x ${s.serviceName}`).join(', ')}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-[320px] lg:w-[340px] flex flex-col bg-card shrink-0">
        <div className="px-4 py-2 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Bill</p>
          <p className="text-[10px] text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2" style={{ scrollbarWidth: 'none' }}>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 rounded-lg bg-gold/5 flex items-center justify-center mb-3">
                <Receipt className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-xs text-muted-foreground">Select services from the left to build the bill</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-2 text-sm group transition-all duration-150">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  {item.stylistName && <p className="text-[10px] text-muted-foreground">{item.stylistName}</p>}
                </div>

                {item.type === 'product' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => onUpdateItemQty(item.id, Math.max(1, item.quantity - 1))} className="w-6 h-6 bg-background border border-border flex items-center justify-center transition-all duration-150">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs w-5 text-center">{item.quantity}</span>
                    <button onClick={() => onUpdateItemQty(item.id, item.quantity + 1)} className="w-6 h-6 bg-background border border-border flex items-center justify-center transition-all duration-150">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {editingPrice === item.id ? (
                  <Input
                    type="number"
                    defaultValue={item.unitPrice}
                    className="w-20 h-7 text-xs text-right"
                    autoFocus
                    min={0}
                    onBlur={(e) => { onUpdateItemPrice(item.id, Math.max(0, Number(e.target.value)) || item.unitPrice); setEditingPrice(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                ) : (
                  <button onClick={() => setEditingPrice(item.id)} className="text-xs font-medium hover:text-gold transition-all duration-150" title="Click to edit price">
                    {formatPKR(item.totalPrice)}
                  </button>
                )}

                <button onClick={() => onRemoveItem(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all duration-150">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-3 space-y-2">
          <button
            onClick={() => setShowDiscount(!showDiscount)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all duration-150"
          >
            <Tag className="w-3 h-3" /> {showDiscount ? 'Hide discounts' : 'Discounts / Promo / Points'}
          </button>

          {showDiscount && (
            <div className="bg-background/50 p-3 border border-border/20 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">Flat (Rs)</label>
                  <Input type="number" value={discountType === 'flat' ? discountValue : ''} onChange={(e) => onSetDiscount(e.target.value ? 'flat' : null, Math.min(Math.max(0, Number(e.target.value)), subtotal))} placeholder="0" className="h-7 text-xs" inputMode="numeric" min={0} max={subtotal} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">Percentage (%)</label>
                  <Input type="number" value={discountType === 'percentage' ? discountValue : ''} onChange={(e) => onSetDiscount(e.target.value ? 'percentage' : null, Number(e.target.value))} placeholder="0" className="h-7 text-xs" inputMode="numeric" max={100} />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="Promo code" className="h-7 text-xs flex-1" />
                <Button size="sm" variant="outline" className="h-7 text-xs transition-all duration-150" onClick={() => onApplyPromo(promoInput)}>Apply</Button>
              </div>
              {promoDiscount > 0 && <p className="text-xs text-green-600">Promo applied: -{formatPKR(promoDiscount)}</p>}
              {loyaltyPointsAvailable > 0 && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={loyaltyPointsUsed > 0} onChange={(e) => onSetLoyaltyPoints(e.target.checked ? loyaltyPointsAvailable : 0)} className="rounded" />
                  Use points ({loyaltyPointsAvailable} pts = {formatPKR(loyaltyPointsAvailable * 0.5)})
                </label>
              )}
            </div>
          )}

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPKR(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{formatPKR(totalDiscount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span>{formatPKR(taxAmount)}</span>
              </div>
            )}
            <Separator className="bg-border/30" />
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold">TOTAL</span>
              <span className="text-2xl font-bold">{formatPKR(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
