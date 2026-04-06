'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, Package as PackageIcon, Minus, X, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import type { Product, InventoryType, Service, ProductServiceLink } from '@/types/database';

type Tab = 'all' | 'backbar' | 'retail' | 'low';

const BRANDS = ["L'Oréal Professionnel", 'Keune', 'Wella Professionals', 'Schwarzkopf Professional', 'OPI', 'Streax', 'Garnier', 'TRESemmé', 'Revlon Professional', 'Matrix', 'Other'];
const CATEGORIES = ['Shampoo', 'Conditioner', 'Hair Color', 'Treatment', 'Nail Polish', 'Wax', 'Threading Thread', 'Facial Product', 'Tool', 'Other'];
const UNITS = ['bottle', 'tube', 'box', 'jar', 'can', 'pack', 'piece', 'sachet'];
const CONTENT_UNITS = ['ml', 'g', 'strips', 'pieces', 'applications'];

export default function ProductsPage() {
  return <Suspense><ProductsContent /></Suspense>;
}

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { salon, currentBranch } = useAppStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'all');
  const [brandFilter, setBrandFilter] = useState('');

  // Product form modal
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formType, setFormType] = useState<InventoryType>('backbar');
  const [formUnit, setFormUnit] = useState('bottle');
  const [formContentPerUnit, setFormContentPerUnit] = useState('1');
  const [formContentUnit, setFormContentUnit] = useState('ml');
  const [formPurchasePrice, setFormPurchasePrice] = useState('');
  const [formRetailPrice, setFormRetailPrice] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formThreshold, setFormThreshold] = useState('5');
  const [saving, setSaving] = useState(false);

  // Stock adjustment modal
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  // Services (for linking)
  const [services, setServices] = useState<Service[]>([]);

  const fetchProducts = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const { data } = await supabase.from('products').select('*').eq('salon_id', salon.id).eq('is_active', true).order('name');
    if (data) setProducts(data as Product[]);
    setLoading(false);
  }, [salon]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.brand || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (brandFilter && p.brand !== brandFilter) return false;
    switch (tab) {
      case 'backbar': return p.inventory_type === 'backbar';
      case 'retail': return p.inventory_type === 'retail';
      case 'low': return p.current_stock <= p.low_stock_threshold;
      default: return true;
    }
  });

  // Inline service link state for product form
  const [formLinks, setFormLinks] = useState<Array<{ id?: string; serviceId: string; serviceName: string; qtyPerUse: number }>>([]);
  const [formLinkSvcId, setFormLinkSvcId] = useState('');
  const [formLinkQty, setFormLinkQty] = useState('');

  async function openForm(product?: Product) {
    // Load services for link picker
    if (salon && services.length === 0) {
      const { data } = await supabase.from('services').select('*').eq('salon_id', salon.id).eq('is_active', true).order('name');
      if (data) setServices(data as Service[]);
    }

    if (product) {
      setEditProduct(product);
      setFormName(product.name); setFormBrand(product.brand || ''); setFormCategory(product.category || '');
      setFormType(product.inventory_type); setFormUnit(product.unit);
      setFormContentPerUnit(String(product.content_per_unit || 1)); setFormContentUnit(product.content_unit || 'ml');
      setFormPurchasePrice(String(product.purchase_price));
      setFormRetailPrice(String(product.retail_price)); setFormStock(String(product.current_stock)); setFormThreshold(String(product.low_stock_threshold));
      // Load existing links
      const { data: linkData } = await supabase.from('product_service_links').select('*').eq('product_id', product.id);
      if (linkData) {
        const svcRes = services.length > 0 ? services : (await supabase.from('services').select('*').eq('salon_id', salon!.id).eq('is_active', true).order('name')).data as Service[] || [];
        if (svcRes.length > 0 && services.length === 0) setServices(svcRes);
        setFormLinks((linkData as ProductServiceLink[]).map(l => {
          const svc = svcRes.find(s => s.id === l.service_id);
          return { id: l.id, serviceId: l.service_id, serviceName: svc?.name || 'Unknown', qtyPerUse: l.quantity_per_use };
        }));
      } else {
        setFormLinks([]);
      }
    } else {
      setEditProduct(null);
      setFormName(''); setFormBrand(''); setFormCategory(''); setFormType('backbar'); setFormUnit('bottle');
      setFormContentPerUnit('1'); setFormContentUnit('ml');
      setFormPurchasePrice(''); setFormRetailPrice(''); setFormStock(''); setFormThreshold('5');
      setFormLinks([]);
    }
    setFormLinkSvcId(''); setFormLinkQty('');
    setShowForm(true);
  }

  function addFormLink() {
    if (!formLinkSvcId || !formLinkQty) return;
    const svc = services.find(s => s.id === formLinkSvcId);
    if (!svc) return;
    if (formLinks.some(l => l.serviceId === formLinkSvcId)) { toast.error('Service already linked'); return; }
    setFormLinks([...formLinks, { serviceId: formLinkSvcId, serviceName: svc.name, qtyPerUse: Number(formLinkQty) }]);
    setFormLinkSvcId(''); setFormLinkQty('');
  }

  function removeFormLink(serviceId: string) {
    setFormLinks(formLinks.filter(l => l.serviceId !== serviceId));
  }

  async function saveProduct() {
    if (!salon) return;
    if (!formName.trim()) { toast.error('Name required'); return; }
    if (Number(formPurchasePrice) > 0 && Number(formRetailPrice) > 0 && Number(formPurchasePrice) > Number(formRetailPrice)) {
      toast('Purchase price exceeds retail price — check your values', { icon: '⚠️' });
    }
    setSaving(true);
    try {
      const data = {
        salon_id: salon.id, name: formName.trim(), brand: formBrand || null, category: formCategory || null,
        inventory_type: formType, unit: formUnit,
        content_per_unit: Number(formContentPerUnit) || 1, content_unit: formContentUnit,
        purchase_price: Number(formPurchasePrice) || 0,
        retail_price: Number(formRetailPrice) || 0, current_stock: Number(formStock) || 0, low_stock_threshold: Number(formThreshold) || 5,
      };
      let productId: string;
      if (editProduct) {
        const { error } = await supabase.from('products').update(data).eq('id', editProduct.id);
        if (error) throw error;
        productId = editProduct.id;
        toast.success('Product updated');
      } else {
        const { data: newProd, error } = await supabase.from('products').insert(data).select().single();
        if (error) throw error;
        productId = newProd.id;
        toast.success('Product added');
      }

      // Sync service links: delete old, insert new
      if (formType === 'backbar') {
        await supabase.from('product_service_links').delete().eq('product_id', productId);
        if (formLinks.length > 0) {
          await supabase.from('product_service_links').insert(
            formLinks.map(l => ({ product_id: productId, service_id: l.serviceId, quantity_per_use: l.qtyPerUse }))
          );
        }
      }

      setShowForm(false);
      fetchProducts();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function saveAdjustment() {
    if (!adjustProduct || !adjustQty || !currentBranch) return;
    setSavingAdjust(true);
    try {
      const qty = Number(adjustQty);
      const newStock = adjustProduct.current_stock + qty;
      await supabase.from('products').update({ current_stock: Math.max(0, newStock) }).eq('id', adjustProduct.id);
      await supabase.from('stock_movements').insert({
        product_id: adjustProduct.id, branch_id: currentBranch.id,
        movement_type: 'adjustment', quantity: qty, notes: adjustReason || null,
      });
      toast.success('Stock adjusted');
      setShowAdjust(false); setAdjustQty(''); setAdjustReason('');
      fetchProducts();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSavingAdjust(false); }
  }

  function getStockBadge(p: Product) {
    if (p.current_stock <= 0) return <Badge variant="destructive" className="text-[10px]">Out</Badge>;
    if (p.current_stock <= p.low_stock_threshold) return <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-500/25 bg-yellow-500/10">Low</Badge>;
    return <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25 bg-green-500/10">OK</Badge>;
  }

  const margin = (p: Product) => p.purchase_price > 0 && p.retail_price > 0 ? Math.round((p.retail_price - p.purchase_price) / p.purchase_price * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/dashboard/inventory" className="hover:text-foreground transition-colors">Inventory</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">Products</span>
      </div>

      <div className="calendar-card bg-card border border-border p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="calendar-card pl-8 h-9" />
          </div>
          <Button onClick={() => openForm()} className="calendar-card bg-gold hover:bg-gold/90 text-black font-bold" size="sm"><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="h-auto gap-1 flex-wrap">
            <TabsTrigger value="all" className="text-xs px-3.5 py-2 font-medium transition-all duration-150 data-[state=active]:bg-[#1A1A1A] data-[state=active]:text-white data-[state=active]:border-[#1A1A1A] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">All ({products.length})</TabsTrigger>
            <TabsTrigger value="backbar" className="text-xs px-3.5 py-2 font-medium transition-all duration-150 data-[state=active]:bg-[#1A1A1A] data-[state=active]:text-white data-[state=active]:border-[#1A1A1A] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Backbar</TabsTrigger>
            <TabsTrigger value="retail" className="text-xs px-3.5 py-2 font-medium transition-all duration-150 data-[state=active]:bg-[#1A1A1A] data-[state=active]:text-white data-[state=active]:border-[#1A1A1A] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Retail</TabsTrigger>
            <TabsTrigger value="low" className="text-xs px-3.5 py-2 font-medium transition-all duration-150 data-[state=active]:bg-[#1A1A1A] data-[state=active]:text-white data-[state=active]:border-[#1A1A1A] border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Low Stock ({products.filter((p) => p.current_stock <= p.low_stock_threshold).length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Brand filters */}
        <div className="flex flex-wrap gap-1">
          {[...new Set(products.map((p) => p.brand).filter(Boolean))].slice(0, 8).map((b) => (
            <button key={b} onClick={() => setBrandFilter(brandFilter === b ? '' : b!)}
              className={`calendar-card text-[10px] px-2 py-1 rounded-full border transition-all ${brandFilter === b ? 'bg-gold/10 border-gold text-foreground' : 'border-border text-muted-foreground hover:border-gold/50'}`}
            >{b}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No products found</p>
      ) : (
        <div className="calendar-card border-border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-center pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4"><p className="font-medium text-sm">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.category}</p></TableCell>
                  <TableCell className="text-sm">{p.brand || '—'}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{p.inventory_type === 'backbar' ? 'Backbar' : 'Retail'}</Badge></TableCell>
                  <TableCell className="text-center text-sm">
                    <p>{p.current_stock} {p.unit}</p>
                    {p.content_per_unit > 1 && <p className="text-[10px] text-muted-foreground">{p.current_stock * p.content_per_unit} {p.content_unit} total</p>}
                  </TableCell>
                  <TableCell className="text-center">{getStockBadge(p)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {p.inventory_type === 'retail' ? (
                      <div><p>{formatPKR(p.retail_price)}</p>{margin(p) > 0 && <p className="text-[10px] text-green-600">{margin(p)}% margin</p>}</div>
                    ) : formatPKR(p.purchase_price)}
                  </TableCell>
                  <TableCell className="text-center pr-4">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openForm(p)}>Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAdjustProduct(p); setShowAdjust(true); }}>Adjust</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Product Form Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="calendar-card max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editProduct ? 'Edit Product' : 'Add Product'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Product Name *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} className="calendar-card mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Brand</Label>
                <select value={formBrand} onChange={(e) => setFormBrand(e.target.value)} className="calendar-card mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm">
                  <option value="">Select</option>{BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Category</Label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="calendar-card mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm">
                  <option value="">Select</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Inventory Type</Label>
                <div className="flex gap-2 mt-1">
                  {(['backbar', 'retail'] as InventoryType[]).map((t) => (
                    <button key={t} onClick={() => setFormType(t)} className={`calendar-card flex-1 py-2 border text-xs font-medium ${formType === t ? 'border-gold bg-gold/10' : 'border-border'}`}>
                      {t === 'backbar' ? 'Backbar' : 'Retail'}
                    </button>
                  ))}
                </div>
              </div>
              <div><Label className="text-xs">Packaging Unit</Label>
                <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)} className="calendar-card mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Content per {formUnit}</Label>
                <Input type="number" value={formContentPerUnit} onChange={(e) => setFormContentPerUnit(e.target.value)} placeholder="e.g. 60" className="calendar-card mt-1" inputMode="decimal" step="0.1" />
              </div>
              <div>
                <Label className="text-xs">Content Unit</Label>
                <select value={formContentUnit} onChange={(e) => setFormContentUnit(e.target.value)} className="calendar-card mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm">
                  {CONTENT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            {Number(formContentPerUnit) > 1 && (
              <p className="text-xs text-muted-foreground bg-blue-500/10 p-2 rounded">
                Each {formUnit} contains {formContentPerUnit} {formContentUnit}. Total content in stock: {(Number(formStock) || 0) * (Number(formContentPerUnit) || 1)} {formContentUnit}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Purchase Price (Rs)</Label><Input type="number" value={formPurchasePrice} onChange={(e) => setFormPurchasePrice(e.target.value)} className="calendar-card mt-1" inputMode="numeric" /></div>
              {formType === 'retail' && <div><Label className="text-xs">Retail Price (Rs)</Label><Input type="number" value={formRetailPrice} onChange={(e) => setFormRetailPrice(e.target.value)} className="calendar-card mt-1" inputMode="numeric" />
                {Number(formPurchasePrice) > 0 && Number(formRetailPrice) > 0 && <p className="text-xs text-green-600 mt-0.5">Margin: {Math.round((Number(formRetailPrice) - Number(formPurchasePrice)) / Number(formPurchasePrice) * 100)}%</p>}
              </div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Current Stock</Label><Input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} className="calendar-card mt-1" inputMode="numeric" /></div>
              <div><Label className="text-xs">Low Stock Threshold</Label><Input type="number" value={formThreshold} onChange={(e) => setFormThreshold(e.target.value)} className="calendar-card mt-1" inputMode="numeric" /></div>
            </div>
            {/* Service Usage — only for backbar */}
            {formType === 'backbar' && (
              <div className="pt-3 border-t space-y-3">
                <div>
                  <Label className="text-xs font-semibold">Service Usage</Label>
                  <p className="text-[10px] text-muted-foreground">Which services use this product and how much {formContentUnit || 'content'} per client?</p>
                </div>

                {formLinks.length > 0 && (
                  <div className="space-y-1.5">
                    {formLinks.map((link) => (
                      <div key={link.serviceId} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="truncate">{link.serviceName}</span>
                          {Number(formContentPerUnit) > 1 && (
                            <p className="text-[10px] text-muted-foreground">1 {formUnit} = {Math.floor(Number(formContentPerUnit) / link.qtyPerUse)} clients</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{link.qtyPerUse} {formContentUnit}/client</span>
                        <button onClick={() => removeFormLink(link.serviceId)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <select value={formLinkSvcId} onChange={(e) => setFormLinkSvcId(e.target.value)} className="calendar-card w-full h-9 rounded-md border bg-background px-3 text-sm">
                      <option value="">Select service...</option>
                      {services.filter(s => !formLinks.some(l => l.serviceId === s.id)).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <Input type="number" value={formLinkQty} onChange={(e) => setFormLinkQty(e.target.value)} placeholder={formContentUnit} className="calendar-card h-9" step="0.1" inputMode="decimal" />
                  </div>
                  <Button variant="outline" size="sm" onClick={addFormLink} disabled={!formLinkSvcId || !formLinkQty} className="h-9">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button onClick={saveProduct} disabled={saving} className="flex-1 bg-gold text-black border border-gold">{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Modal */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent className="calendar-card max-w-sm">
          <DialogHeader><DialogTitle>Adjust Stock — {adjustProduct?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Current stock: <span className="font-bold">{adjustProduct?.current_stock} {adjustProduct?.unit}</span></p>
            <div><Label className="text-xs">Quantity Change (+ or -)</Label><Input type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} placeholder="+10 or -5" className="calendar-card mt-1" /></div>
            {adjustQty && <p className="text-xs text-muted-foreground">New stock: {(adjustProduct?.current_stock || 0) + Number(adjustQty)}</p>}
            <div><Label className="text-xs">Reason *</Label><Textarea value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Damaged, Recount, Wastage" rows={2} className="calendar-card mt-1" /></div>
            <Button onClick={saveAdjustment} disabled={savingAdjust || !adjustQty || !adjustReason} className="w-full bg-gold text-black border border-gold">{savingAdjust ? 'Saving...' : 'Save Adjustment'}</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
