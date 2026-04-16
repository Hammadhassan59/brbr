'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, Loader2, Pencil, Save, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatDateTime } from '@/lib/utils/dates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getBackbarConsumptionReport, recordBackbarActual, type BackbarReportRow } from '@/app/actions/inventory';
import type { StockMovement, Product, Staff } from '@/types/database';

const MOVE_LABELS: Record<string, { label: string; color: string }> = {
  purchase: { label: 'Stock In', color: 'text-green-600' },
  sale: { label: 'Sale', color: 'text-blue-600' },
  backbar_use: { label: 'Backbar', color: 'text-purple-600' },
  adjustment: { label: 'Adjust', color: 'text-orange-600' },
  transfer_in: { label: 'In', color: 'text-green-600' },
  transfer_out: { label: 'Out', color: 'text-red-600' },
};

export default function InventoryReportPage() {
  const { salon } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [staffFilter, setStaffFilter] = useState('');

  const [movements, setMovements] = useState<(StockMovement & { product?: Product })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [movementLimit, setMovementLimit] = useState(50);
  const [staffOptions, setStaffOptions] = useState<Staff[]>([]);
  const [reportRows, setReportRows] = useState<BackbarReportRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const [movRes, prodRes, staffRes] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('*, product:products!inner(*, salon_id)')
        .eq('product.salon_id', salon.id)
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('products').select('*').eq('salon_id', salon.id).eq('is_active', true),
      supabase.from('staff').select('*').eq('salon_id', salon.id).eq('is_active', true).order('name'),
    ]);
    if (movRes.data) setMovements(movRes.data as (StockMovement & { product?: Product })[]);
    if (prodRes.data) setProducts(prodRes.data as Product[]);
    if (staffRes.data) setStaffOptions(staffRes.data as Staff[]);
    setLoading(false);
  }, [salon, dateFrom, dateTo]);

  const fetchReport = useCallback(async () => {
    if (!salon) return;
    setReportLoading(true);
    const { data, error } = await getBackbarConsumptionReport({
      from: dateFrom,
      to: dateTo,
      staffId: staffFilter || undefined,
    });
    if (error) {
      toast.error(`Could not load backbar report: ${error}`);
      setReportRows([]);
    } else {
      setReportRows(data?.rows ?? []);
    }
    setReportLoading(false);
  }, [salon, dateFrom, dateTo, staffFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Retail sales (kept for the bottom right card; backbar moves to its own section)
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

  const totalStockValue = products.reduce((s, p) => s + p.current_stock * (p.inventory_type === 'retail' ? p.retail_price : p.purchase_price), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard/reports" className="hover:text-foreground">Reports</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">Inventory</span>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-xl font-bold">Inventory Report</h2>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-8" />
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-8" />
          <Label className="text-xs">Stylist</Label>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="border border-border rounded-md h-8 text-sm px-2 bg-card"
          >
            <option value="">All stylists</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Current Stock Valuation</p>
          <p className="text-3xl font-heading font-bold">{formatPKR(totalStockValue)}</p>
        </CardContent>
      </Card>

      {/* Backbar consumption — services × link qty, with per-stylist breakdown
          and owner-editable stocktake. Replaces the old "actual from stock
          movements" column which was unreliable. */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Backbar Consumption</CardTitle>
          <p className="text-xs text-muted-foreground">
            Expected product usage based on services performed in this window. Click a row to see which stylists
            consumed how much. Hit &quot;Audit&quot; on a row to enter your physical stocktake count and see the variance.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          {reportLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : reportRows.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              No backbar consumption in this window. Either no service-product links are configured, or no
              services were rendered between {dateFrom} and {dateTo}.
            </p>
          ) : (
            <div className="divide-y border-y">
              {reportRows.map((row) => (
                <BackbarRow
                  key={row.product_id}
                  row={row}
                  periodFrom={dateFrom}
                  periodTo={dateTo}
                  onSaved={fetchReport}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Retail Sales</CardTitle></CardHeader>
        <CardContent className="px-0">
          {loading ? <div className="h-20 bg-muted rounded-lg animate-pulse mx-4" /> : retailData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No retail sales</p> : (
            <Table><TableHeader><TableRow><TableHead className="pl-4">Product</TableHead><TableHead className="text-center">Sold</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right pr-4">Profit</TableHead></TableRow></TableHeader>
              <TableBody>{retailData.map((d) => (
                <TableRow key={d.name}><TableCell className="pl-4 text-sm">{d.name}</TableCell><TableCell className="text-center text-sm">{d.qty}</TableCell><TableCell className="text-right text-sm">{formatPKR(d.revenue)}</TableCell><TableCell className="text-right pr-4 text-sm text-green-600">{formatPKR(d.profit)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Stock Movements Log ({movements.length})
            {movements.length > movementLimit && (
              <span className="text-muted-foreground font-normal ml-1">(showing {Math.min(movementLimit, movements.length)} of {movements.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? <div className="h-20 bg-muted rounded-lg animate-pulse mx-4" /> : movements.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No movements in this period</p>
          ) : (
            <>
              <Table><TableHeader><TableRow><TableHead className="pl-4">Product</TableHead><TableHead>Type</TableHead><TableHead className="text-center">Qty</TableHead><TableHead>Notes</TableHead><TableHead className="text-right pr-4">Date</TableHead></TableRow></TableHeader>
                <TableBody>{movements.slice(0, movementLimit).map((m) => {
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
              {movements.length > movementLimit && (
                <div className="flex justify-center py-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setMovementLimit((prev) => prev + 50)}
                  >
                    Show more ({movements.length - movementLimit} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BackbarRow({
  row,
  periodFrom,
  periodTo,
  onSaved,
}: {
  row: BackbarReportRow;
  periodFrom: string;
  periodTo: string;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [actualInput, setActualInput] = useState(row.actual_qty != null ? String(row.actual_qty) : '');
  const [notesInput, setNotesInput] = useState(row.actual_notes ?? '');
  const [saving, setSaving] = useState(false);

  const unit = row.content_unit || 'units';
  const hasActual = row.actual_qty != null;
  const variancePct = row.variance_pct;

  async function save() {
    const n = Number(actualInput);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a valid non-negative number');
      return;
    }
    setSaving(true);
    const { error } = await recordBackbarActual({
      product_id: row.product_id,
      period_start: periodFrom,
      period_end: periodTo,
      actual_qty: n,
      notes: notesInput.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success('Stocktake saved');
    setAuditing(false);
    onSaved();
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-left flex-1 min-w-0 hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {row.product_name}
              {row.brand && <span className="text-muted-foreground font-normal ml-1">· {row.brand}</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {row.services_count} service{row.services_count === 1 ? '' : 's'} · {row.by_stylist.length} stylist{row.by_stylist.length === 1 ? '' : 's'}
            </p>
          </div>
        </button>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">Expected</p>
          <p className="text-sm font-semibold">
            {round(row.expected_qty)} {unit}
          </p>
          <p className="text-[10px] text-muted-foreground">{formatPKR(row.expected_cost)}</p>
        </div>

        {hasActual && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Actual</p>
            <p className="text-sm font-semibold">
              {round(row.actual_qty!)} {unit}
            </p>
            <p className="text-[10px] text-muted-foreground">stocktake</p>
          </div>
        )}

        {hasActual && variancePct != null && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Variance</p>
            <p className={`text-sm font-semibold ${
              Math.abs(variancePct) > 30 ? 'text-red-600' :
              Math.abs(variancePct) > 15 ? 'text-amber-600' : 'text-green-600'
            }`}>
              {row.variance_qty! >= 0 ? '+' : ''}{round(row.variance_qty!)} {unit}
            </p>
            <p className={`text-[10px] ${Math.abs(variancePct) > 15 ? 'font-medium' : 'text-muted-foreground'}`}>
              {variancePct >= 0 ? '+' : ''}{round(variancePct)}%
            </p>
          </div>
        )}

        <Button
          size="sm"
          variant={auditing ? 'secondary' : 'outline'}
          onClick={() => setAuditing((v) => !v)}
          className="h-8 text-xs"
        >
          {auditing ? <><X className="w-3 h-3 mr-1" /> Cancel</> : <><Pencil className="w-3 h-3 mr-1" /> {hasActual ? 'Edit actual' : 'Audit'}</>}
        </Button>
      </div>

      {auditing && (
        <div className="mt-3 ml-5 p-3 rounded-lg border border-gold/30 bg-gold/5 space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter the qty you actually consumed between {periodFrom} and {periodTo} (in {unit}).
            We&apos;ll compare it to the expected {round(row.expected_qty)} {unit} and show the variance.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[8rem]">
              <Label className="text-xs">Actual ({unit})</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={actualInput}
                onChange={(e) => setActualInput(e.target.value)}
                className="h-9 mt-1"
              />
            </div>
            <div className="flex-[2] min-w-[10rem]">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                rows={1}
                className="mt-1 text-sm"
                placeholder="e.g. counted on Apr 1 stocktake"
              />
            </div>
            <Button onClick={save} disabled={saving} className="h-9 bg-gold text-black hover:bg-gold/90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save</>}
            </Button>
          </div>
        </div>
      )}

      {expanded && row.by_stylist.length > 0 && (
        <div className="mt-3 ml-5 rounded-lg border border-border bg-muted/30 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3">Stylist</TableHead>
                <TableHead className="text-center">Services</TableHead>
                <TableHead className="text-right pr-3">Expected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.by_stylist.map((s) => (
                <TableRow key={s.staff_id}>
                  <TableCell className="pl-3 text-sm">{s.staff_name}</TableCell>
                  <TableCell className="text-center text-sm">{s.services_count}</TableCell>
                  <TableCell className="text-right pr-3 text-sm font-medium">
                    {round(s.expected_qty)} {unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {expanded && row.by_stylist.length === 0 && (
        <p className="mt-3 ml-5 text-xs text-muted-foreground">No bills had a stylist attribution in this window.</p>
      )}

      {hasActual && variancePct != null && Math.abs(variancePct) > 30 && (
        <div className="mt-2 ml-5 flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5" />
          Variance over 30% — worth investigating
        </div>
      )}
      {hasActual && variancePct != null && Math.abs(variancePct) <= 15 && (
        <div className="mt-2 ml-5 flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Within 15% — looks healthy
        </div>
      )}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
