'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Package, AlertTriangle, ShoppingBag, Beaker, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatDateTime } from '@/lib/utils/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// Layout provides shared tab navigation
import type { Product, StockMovement } from '@/types/database';

export default function InventoryDashboardPage() {
  const { salon } = useAppStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<(StockMovement & { product_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    try {
      const [prodRes, movRes] = await Promise.all([
        supabase.from('products').select('*').eq('salon_id', salon.id).eq('is_active', true).order('name'),
        // stock_movements has no salon_id column — inner-join products and filter
        // by product.salon_id so we never surface another tenant's movements.
        supabase.from('stock_movements').select('*, product:products!inner(name, salon_id)').eq('product.salon_id', salon.id).order('created_at', { ascending: false }).limit(10),
      ]);
      if (prodRes.data) setProducts(prodRes.data as Product[]);
      if (movRes.data) setMovements(movRes.data.map((m: Record<string, unknown>) => ({
        ...m, product_name: (m.product as { name: string } | null)?.name,
      })) as (StockMovement & { product_name?: string })[]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [salon]);

  useEffect(() => { fetch(); }, [fetch]);

  const lowStock = products.filter((p) => p.current_stock <= p.low_stock_threshold);
  const retailValue = products.filter((p) => p.inventory_type === 'retail').reduce((s, p) => s + p.retail_price * p.current_stock, 0);
  const backbarValue = products.filter((p) => p.inventory_type === 'backbar').reduce((s, p) => s + p.purchase_price * p.current_stock, 0);

  const MOVE_LABELS: Record<string, { label: string; color: string }> = {
    purchase: { label: 'Stock In', color: 'text-green-600' },
    sale: { label: 'Sale', color: 'text-blue-600' },
    backbar_use: { label: 'Backbar Use', color: 'text-purple-600' },
    adjustment: { label: 'Adjustment', color: 'text-orange-600' },
    transfer_in: { label: 'Transfer In', color: 'text-green-600' },
    transfer_out: { label: 'Transfer Out', color: 'text-red-600' },
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
        {[
          { label: 'Total Products', value: String(products.length), icon: Package, color: 'text-muted-foreground', bg: 'bg-secondary', urgent: false },
          { label: 'Low Stock', value: String(lowStock.length), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/10', urgent: lowStock.length > 0 },
          { label: 'Retail Value', value: formatPKR(retailValue), icon: ShoppingBag, color: 'text-muted-foreground', bg: 'bg-secondary', urgent: false },
          { label: 'Backbar Value', value: formatPKR(backbarValue), icon: Beaker, color: 'text-muted-foreground', bg: 'bg-secondary', urgent: false },
        ].map((c) => (
          <Card key={c.label} className={`border-border ${c.urgent ? 'border-amber-500/25 bg-amber-500/5' : ''}`}>
            <CardContent className="p-4">
              {loading ? <div className="h-12 bg-muted rounded-lg animate-pulse" /> : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                    <c.icon className="w-4 h-4 text-foreground" />
                  </div>
                  <p className={`text-xl font-heading font-bold ${c.urgent ? 'text-amber-600' : ''}`}>{c.value}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
        {/* Low stock alerts */}
        <Card className="border-border">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Low Stock Alerts</CardTitle>
            <Link href="/dashboard/inventory/products?tab=low"><Button variant="ghost" size="sm" className="text-xs gap-1">View All <ArrowRight className="w-3 h-3" /></Button></Link>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-20 bg-muted rounded-lg animate-pulse" /> : lowStock.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">All stock levels are OK</p>
            ) : (
              <div className="space-y-2 stagger-children">
                {lowStock.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-card rounded-lg border border-border animate-fade-up">
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.brand}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="destructive" className="text-[10px]">{p.current_stock} left</Badge>
                      <p className="text-[10px] text-muted-foreground">Min: {p.low_stock_threshold}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent movements */}
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Stock Movements</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-20 bg-muted rounded-lg animate-pulse" /> : movements.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">No recent movements</p>
            ) : (
              <div className="space-y-2 stagger-children">
                {movements.map((m) => {
                  const style = MOVE_LABELS[m.movement_type] || { label: m.movement_type, color: 'text-gray-600' };
                  return (
                    <div key={m.id} className="flex items-center justify-between text-sm p-3 bg-card rounded-lg border border-border animate-fade-up">
                      <div>
                        <p className="font-medium">{m.product_name || 'Unknown'}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDateTime(m.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={`text-[10px] ${style.color}`}>{style.label}</Badge>
                        <p className="text-xs">{m.quantity > 0 ? '+' : ''}{m.quantity}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
