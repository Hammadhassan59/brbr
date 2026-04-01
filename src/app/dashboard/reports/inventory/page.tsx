'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatDateTime } from '@/lib/utils/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { StockMovement, Product, ProductServiceLink, BillItem } from '@/types/database';

const MOVE_LABELS: Record<string, { label: string; color: string }> = {
  purchase: { label: 'Stock In', color: 'text-green-600' },
  sale: { label: 'Sale', color: 'text-blue-600' },
  backbar_use: { label: 'Backbar', color: 'text-purple-600' },
  adjustment: { label: 'Adjust', color: 'text-orange-600' },
  transfer_in: { label: 'In', color: 'text-green-600' },
  transfer_out: { label: 'Out', color: 'text-red-600' },
};

export default function InventoryReportPage() {
  const { salon, currentBranch } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [movements, setMovements] = useState<(StockMovement & { product?: Product })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Array<{
    productName: string; contentUnit: string; packagingUnit: string; contentPerUnit: number;
    expectedUsage: number; actualUsage: number; variance: number; variancePercent: number;
    expectedUnits: number; actualUnits: number;
    servicesCount: number; flag: 'ok' | 'warning' | 'alert';
  }>>([]);

  const fetchData = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const [movRes, prodRes, linksRes, billItemsRes] = await Promise.all([
      supabase.from('stock_movements').select('*, product:products(*)').gte('created_at', `${dateFrom}T00:00:00`).lte('created_at', `${dateTo}T23:59:59`).order('created_at', { ascending: false }).limit(200),
      supabase.from('products').select('*').eq('salon_id', salon.id).eq('is_active', true),
      supabase.from('product_service_links').select('*'),
      supabase.from('bill_items').select('*').eq('item_type', 'service'),
    ]);
    if (movRes.data) setMovements(movRes.data as (StockMovement & { product?: Product })[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);

    // Compute discrepancies
    if (linksRes.data && billItemsRes.data && movRes.data && prodRes.data) {
      const links = linksRes.data as ProductServiceLink[];
      const billItems = billItemsRes.data as BillItem[];
      const allProducts = prodRes.data as Product[];
      const allMoves = movRes.data as (StockMovement & { product?: Product })[];

      // For each product that has service links, compute expected vs actual
      const productIds = [...new Set(links.map(l => l.product_id))];
      const disc: typeof discrepancies = [];

      for (const productId of productIds) {
        const product = allProducts.find(p => p.id === productId);
        if (!product) continue;

        const productLinks = links.filter(l => l.product_id === productId);
        const serviceIds = productLinks.map(l => l.service_id);

        // Count how many times each linked service was performed (from bill items)
        let totalExpected = 0;
        let totalServicesCount = 0;
        for (const link of productLinks) {
          const count = billItems.filter(bi => bi.service_id === link.service_id).length;
          totalExpected += count * link.quantity_per_use;
          totalServicesCount += count;
        }

        // Actual backbar usage in whole units (boxes/tubes consumed)
        const actualUnitsUsed = Math.abs(
          allMoves
            .filter(m => m.product_id === productId && m.movement_type === 'backbar_use')
            .reduce((s, m) => s + m.quantity, 0)
        );

        // Convert actual units to content amount
        const contentPerUnit = product.content_per_unit || 1;
        const actualContent = actualUnitsUsed * contentPerUnit;

        // Expected is already in content units (ml, g, strips)
        const variance = actualContent - totalExpected;
        const variancePct = totalExpected > 0 ? (variance / totalExpected) * 100 : 0;

        // Expected in packaging units for display
        const expectedUnits = contentPerUnit > 0 ? totalExpected / contentPerUnit : totalExpected;

        let flag: 'ok' | 'warning' | 'alert' = 'ok';
        if (Math.abs(variancePct) > 30) flag = 'alert';
        else if (Math.abs(variancePct) > 15) flag = 'warning';

        disc.push({
          productName: product.name,
          contentUnit: product.content_unit || product.unit,
          packagingUnit: product.unit,
          contentPerUnit,
          expectedUsage: Math.round(totalExpected * 10) / 10,
          actualUsage: Math.round(actualContent * 10) / 10,
          expectedUnits: Math.round(expectedUnits * 10) / 10,
          actualUnits: actualUnitsUsed,
          variance: Math.round(variance * 10) / 10,
          variancePercent: Math.round(variancePct),
          servicesCount: totalServicesCount,
          flag,
        });
      }

      setDiscrepancies(disc.sort((a, b) => Math.abs(b.variancePercent) - Math.abs(a.variancePercent)));
    }

    setLoading(false);
  }, [salon, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Backbar consumption
  const backbarMoves = movements.filter((m) => m.movement_type === 'backbar_use');
  const backbarByProduct: Record<string, { name: string; qty: number; cost: number }> = {};
  backbarMoves.forEach((m) => {
    const name = m.product?.name || 'Unknown';
    if (!backbarByProduct[name]) backbarByProduct[name] = { name, qty: 0, cost: 0 };
    backbarByProduct[name].qty += Math.abs(m.quantity);
    backbarByProduct[name].cost += Math.abs(m.quantity) * (m.product?.purchase_price || 0);
  });
  const backbarData = Object.values(backbarByProduct).sort((a, b) => b.cost - a.cost);

  // Retail sales
  const retailMoves = movements.filter((m) => m.movement_type === 'sale');
  const retailByProduct: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
  retailMoves.forEach((m) => {
    const name = m.product?.name || 'Unknown';
    if (!retailByProduct[name]) retailByProduct[name] = { name, qty: 0, revenue: 0, profit: 0 };
    retailByProduct[name].qty += Math.abs(m.quantity);
    retailByProduct[name].revenue += Math.abs(m.quantity) * (m.product?.retail_price || 0);
    retailByProduct[name].profit += Math.abs(m.quantity) * ((m.product?.retail_price || 0) - (m.product?.purchase_price || 0));
  });
  const retailData = Object.values(retailByProduct).sort((a, b) => b.revenue - a.revenue);

  // Stock valuation
  const totalStockValue = products.reduce((s, p) => s + p.current_stock * (p.inventory_type === 'retail' ? p.retail_price : p.purchase_price), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Reports
        </Link>
        <h2 className="font-heading text-xl font-bold">Inventory Report</h2>
        <div className="flex items-center gap-2 ml-auto">
          <Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-8" />
          <Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-8" />
        </div>
      </div>

      <Card><CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground">Current Stock Valuation</p>
        <p className="text-3xl font-heading font-bold">{formatPKR(totalStockValue)}</p>
      </CardContent></Card>

      {/* Usage Discrepancy Report */}
      {discrepancies.length > 0 && (
        <Card className="border-orange-500/25">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Expected vs Actual Usage
            </CardTitle>
            <p className="text-xs text-muted-foreground">Compares expected product consumption (based on services done) with actual stock usage logged. Large variances may indicate waste, theft, or missed logging.</p>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Product</TableHead>
                  <TableHead className="text-center">Services</TableHead>
                  <TableHead className="text-center">Expected</TableHead>
                  <TableHead className="text-center">Actual Used</TableHead>
                  <TableHead className="text-center">Variance</TableHead>
                  <TableHead className="text-center pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discrepancies.map((d) => (
                  <TableRow key={d.productName} className={d.flag === 'alert' ? 'bg-red-500/5' : d.flag === 'warning' ? 'bg-yellow-500/5' : ''}>
                    <TableCell className="pl-4">
                      <p className="text-sm font-medium">{d.productName}</p>
                      {d.contentPerUnit > 1 && <p className="text-[10px] text-muted-foreground">{d.contentPerUnit} {d.contentUnit}/{d.packagingUnit}</p>}
                    </TableCell>
                    <TableCell className="text-center text-sm">{d.servicesCount}</TableCell>
                    <TableCell className="text-center">
                      <p className="text-sm">{d.expectedUsage} {d.contentUnit}</p>
                      {d.contentPerUnit > 1 && <p className="text-[10px] text-muted-foreground">{d.expectedUnits} {d.packagingUnit}</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <p className="text-sm">{d.actualUsage} {d.contentUnit}</p>
                      {d.contentPerUnit > 1 && <p className="text-[10px] text-muted-foreground">{d.actualUnits} {d.packagingUnit}</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-medium ${d.variance > 0 ? 'text-red-600' : d.variance < 0 ? 'text-blue-600' : ''}`}>
                        {d.variance > 0 ? '+' : ''}{d.variance} {d.contentUnit}
                      </span>
                      <p className={`text-[10px] ${Math.abs(d.variancePercent) > 15 ? 'font-medium' : 'text-muted-foreground'}`}>
                        {d.variancePercent > 0 ? '+' : ''}{d.variancePercent}%
                      </p>
                    </TableCell>
                    <TableCell className="text-center pr-4">
                      {d.flag === 'alert' ? (
                        <Badge variant="destructive" className="text-[10px]">Investigate</Badge>
                      ) : d.flag === 'warning' ? (
                        <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500/25 bg-yellow-500/10">Check</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25 bg-green-500/10">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-4 py-2 text-[10px] text-muted-foreground border-t">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" /> Investigate: &gt;30% variance
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1 ml-3" /> Check: 15-30% variance
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1 ml-3" /> OK: &lt;15% variance
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Backbar consumption */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Backbar Consumption</CardTitle></CardHeader>
          <CardContent className="px-0">
            {backbarData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No backbar usage</p> : (
              <Table><TableHeader><TableRow><TableHead className="pl-4">Product</TableHead><TableHead className="text-center">Used</TableHead><TableHead className="text-right pr-4">Cost</TableHead></TableRow></TableHeader>
                <TableBody>{backbarData.map((d) => (
                  <TableRow key={d.name}><TableCell className="pl-4 text-sm">{d.name}</TableCell><TableCell className="text-center text-sm">{d.qty}</TableCell><TableCell className="text-right pr-4 text-sm">{formatPKR(d.cost)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Retail sales */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Retail Sales</CardTitle></CardHeader>
          <CardContent className="px-0">
            {retailData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No retail sales</p> : (
              <Table><TableHeader><TableRow><TableHead className="pl-4">Product</TableHead><TableHead className="text-center">Sold</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right pr-4">Profit</TableHead></TableRow></TableHeader>
                <TableBody>{retailData.map((d) => (
                  <TableRow key={d.name}><TableCell className="pl-4 text-sm">{d.name}</TableCell><TableCell className="text-center text-sm">{d.qty}</TableCell><TableCell className="text-right text-sm">{formatPKR(d.revenue)}</TableCell><TableCell className="text-right pr-4 text-sm text-green-600">{formatPKR(d.profit)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full movement log */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Stock Movements Log ({movements.length})</CardTitle></CardHeader>
        <CardContent className="px-0">
          {loading ? <div className="h-20 bg-muted rounded animate-pulse mx-4" /> : movements.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No movements in this period</p>
          ) : (
            <Table><TableHeader><TableRow><TableHead className="pl-4">Product</TableHead><TableHead>Type</TableHead><TableHead className="text-center">Qty</TableHead><TableHead>Notes</TableHead><TableHead className="text-right pr-4">Date</TableHead></TableRow></TableHeader>
              <TableBody>{movements.slice(0, 50).map((m) => {
                const style = MOVE_LABELS[m.movement_type] || { label: m.movement_type, color: '' };
                return (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4 text-sm">{m.product?.name || '?'}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${style.color}`}>{style.label}</Badge></TableCell>
                    <TableCell className="text-center text-sm">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{m.notes || '—'}</TableCell>
                    <TableCell className="text-right pr-4 text-xs">{formatDateTime(m.created_at)}</TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
