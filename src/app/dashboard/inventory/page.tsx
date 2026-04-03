'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Package, AlertTriangle, ShoppingBag, Beaker, ArrowRight, Plus, Truck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatDateTime } from '@/lib/utils/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
        supabase.from('stock_movements').select('*, product:products(name)').order('created_at', { ascending: false }).limit(10),
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
      {/* Navigation + Actions */}
      <div className="calendar-card bg-card border border-border shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Link href="/dashboard/inventory/products">
          <Button variant="outline" size="sm" className="calendar-card h-10 px-4 font-medium transition-all duration-150 gap-1.5">
            <Package className="w-3.5 h-3.5" /> Products
          </Button>
        </Link>
        <Link href="/dashboard/inventory/orders">
          <Button variant="outline" size="sm" className="calendar-card h-10 px-4 font-medium transition-all duration-150 gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Orders
          </Button>
        </Link>
        <Link href="/dashboard/inventory/suppliers">
          <Button variant="outline" size="sm" className="calendar-card h-10 px-4 font-medium transition-all duration-150 gap-1.5">
            <Users className="w-3.5 h-3.5" /> Suppliers
          </Button>
        </Link>
        <div className="ml-auto">
          <Link href="/dashboard/inventory/products">
            <Button className="calendar-card bg-gold hover:bg-gold/90 text-black font-bold h-10 px-4 transition-all duration-150">
              <Plus className="w-4 h-4 mr-1" /> Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Products', value: String(products.length), icon: Package, color: 'text-muted-foreground', bg: 'bg-secondary', urgent: false },
          { label: 'Low Stock', value: String(lowStock.length), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/10', urgent: lowStock.length > 0 },
          { label: 'Retail Value', value: formatPKR(retailValue), icon: ShoppingBag, color: 'text-muted-foreground', bg: 'bg-secondary', urgent: false },
          { label: 'Backbar Value', value: formatPKR(backbarValue), icon: Beaker, color: 'text-muted-foreground', bg: 'bg-secondary', urgent: false },
        ].map((c) => (
          <Card key={c.label} className={`calendar-card shadow-sm border-border ${c.urgent ? 'border-amber-500/25 bg-amber-500/5' : ''}`}>
            <CardContent className="p-4">
              {loading ? <div className="h-12 bg-muted rounded animate-pulse" /> : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}><c.icon className={`w-4 h-4 ${c.color}`} /></div>
                  </div>
                  <p className={`text-xl font-heading font-bold ${c.urgent ? 'text-amber-600' : ''}`}>{c.value}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low stock alerts */}
        <Card className="calendar-card shadow-sm border-border">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Low Stock Alerts</CardTitle>
            <Link href="/dashboard/inventory/products?tab=low"><Button variant="ghost" size="sm" className="text-xs gap-1">View All <ArrowRight className="w-3 h-3" /></Button></Link>
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-20 bg-muted rounded animate-pulse" /> : lowStock.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">All stock levels are OK</p>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 5).map((p) => (
                  <div key={p.id} className="calendar-card flex items-center justify-between p-3 bg-secondary/30 border border-border/50">
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
        <Card className="calendar-card shadow-sm border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Stock Movements</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-20 bg-muted rounded animate-pulse" /> : movements.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">No recent movements</p>
            ) : (
              <div className="space-y-2">
                {movements.map((m) => {
                  const style = MOVE_LABELS[m.movement_type] || { label: m.movement_type, color: 'text-gray-600' };
                  return (
                    <div key={m.id} className="calendar-card flex items-center justify-between text-sm p-3 bg-secondary/30 border border-border/50">
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
