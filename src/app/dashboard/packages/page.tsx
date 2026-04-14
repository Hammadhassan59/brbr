'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Package, Tag, Award, Users, Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import { createPackage, updatePackage } from '@/app/actions/packages';
import { EmptyState } from '@/components/empty-state';
import type { Package as PkgType, Service } from '@/types/database';

type Filter = 'all' | 'active' | 'inactive';

interface PackageServiceEntry {
  serviceId: string;
  serviceName: string;
  quantity: number;
}

export default function PackagesPage() {
  const { salon } = useAppStore();
  const [packages, setPackages] = useState<PkgType[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editPkg, setEditPkg] = useState<PkgType | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formValidity, setFormValidity] = useState('30');
  const [formActive, setFormActive] = useState(true);
  const [formServices, setFormServices] = useState<PackageServiceEntry[]>([]);
  const [svcSearch, setSvcSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const [pkgRes, svcRes] = await Promise.all([
      supabase.from('packages').select('*').eq('salon_id', salon.id).order('name'),
      supabase.from('services').select('*').eq('salon_id', salon.id).eq('is_active', true).order('sort_order'),
    ]);
    if (pkgRes.data) setPackages(pkgRes.data as PkgType[]);
    if (svcRes.data) setServices(svcRes.data as Service[]);
    setLoading(false);
  }, [salon]);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = packages.filter((p) => {
    if (filter === 'active') return p.is_active;
    if (filter === 'inactive') return !p.is_active;
    return true;
  });

  function openForm(pkg?: PkgType) {
    if (pkg) {
      setEditPkg(pkg);
      setFormName(pkg.name); setFormDesc(pkg.description || ''); setFormPrice(String(pkg.price));
      setFormValidity(String(pkg.validity_days)); setFormActive(pkg.is_active);
      const svcEntries = Array.isArray(pkg.services) ? (pkg.services as { serviceId: string; serviceName: string; quantity: number }[]) : [];
      setFormServices(svcEntries);
    } else {
      setEditPkg(null);
      setFormName(''); setFormDesc(''); setFormPrice(''); setFormValidity('30');
      setFormActive(true); setFormServices([]);
    }
    setShowForm(true);
  }

  function addServiceToPackage(svc: Service) {
    const existing = formServices.find((s) => s.serviceId === svc.id);
    if (existing) {
      setFormServices(formServices.map((s) => s.serviceId === svc.id ? { ...s, quantity: s.quantity + 1 } : s));
    } else {
      setFormServices([...formServices, { serviceId: svc.id, serviceName: svc.name, quantity: 1 }]);
    }
    setSvcSearch('');
  }

  function removeServiceFromPackage(serviceId: string) {
    setFormServices(formServices.filter((s) => s.serviceId !== serviceId));
  }

  function updateServiceQty(serviceId: string, qty: number) {
    if (qty <= 0) { removeServiceFromPackage(serviceId); return; }
    setFormServices(formServices.map((s) => s.serviceId === serviceId ? { ...s, quantity: qty } : s));
  }

  async function savePackage() {
    if (!salon || !formName.trim() || !formPrice) { toast.error('Name and price required'); return; }
    if (formServices.length === 0) { toast.error('Add at least one service'); return; }
    setSaving(true);
    try {
      const data = {
        name: formName.trim(), description: formDesc || null,
        price: Number(formPrice), validityDays: Number(formValidity) || 30,
        isActive: formActive, services: JSON.parse(JSON.stringify(formServices)),
      };
      if (editPkg) {
        const { error } = await updatePackage(editPkg.id, data);
        if (error) throw new Error(error);
        toast.success('Package updated');
      } else {
        const { error } = await createPackage(data);
        if (error) throw new Error(error);
        toast.success('Package created');
      }
      setShowForm(false); fetch();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  const filteredSvcSearch = services.filter((s) => svcSearch && s.name.toLowerCase().includes(svcSearch.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-xl font-bold flex-1">Packages</h2>
        <Link href="/dashboard/packages/promos"><Button variant="outline" size="sm" className="gap-1"><Tag className="w-3 h-3" /> Promos</Button></Link>
        <Link href="/dashboard/packages/loyalty"><Button variant="outline" size="sm" className="gap-1"><Award className="w-3 h-3" /> Loyalty</Button></Link>
        <Button onClick={() => openForm()} className="bg-gold text-black border border-gold" size="sm"><Plus className="w-4 h-4 mr-1" /> Create Package</Button>
      </div>

      <div className="flex gap-1">
        {([['all', `All (${packages.length})`], ['active', `Active (${packages.filter((p) => p.is_active).length})`], ['inactive', 'Inactive']] as const).map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value as Filter)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all duration-150 ${
              filter === value ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{[1, 2, 3].map((i) => <div key={i} className="h-36 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Gift} text="noPackagesYet" ctaLabel="addPackage" onAction={() => openForm()} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
          {filtered.map((pkg) => {
            const svcList = Array.isArray(pkg.services) ? (pkg.services as unknown as PackageServiceEntry[]) : [];
            return (
              <Card key={pkg.id} className={`animate-fade-up hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer ${!pkg.is_active ? 'opacity-60' : ''}`} onClick={() => openForm(pkg)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-heading font-semibold">{pkg.name}</p>
                      {pkg.description && <p className="text-xs text-muted-foreground mt-0.5">{pkg.description}</p>}
                    </div>
                    <Badge variant={pkg.is_active ? 'default' : 'secondary'} className="text-[10px]">{pkg.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="text-2xl font-bold text-gold mb-2">{formatPKR(pkg.price)}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {svcList.map((s, i) => (
                      <Badge key={`${s.serviceId}-${i}`} variant="outline" className="text-[10px]">{s.quantity}× {s.serviceName}</Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Valid for {pkg.validity_days} days</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Package Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editPkg ? 'Edit Package' : 'Create Package'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Package Name *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Bridal Package" className="mt-1" /></div>
            <div><Label className="text-xs">Description</Label><Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Shown to client on receipt" rows={2} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Price (Rs) *</Label><Input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} className="mt-1" inputMode="numeric" /></div>
              <div><Label className="text-xs">Validity (days)</Label><Input type="number" value={formValidity} onChange={(e) => setFormValidity(e.target.value)} className="mt-1" inputMode="numeric" /></div>
            </div>

            {/* Services */}
            <div>
              <Label className="text-xs">Services Included *</Label>
              <div className="relative mt-1">
                <Input value={svcSearch} onChange={(e) => setSvcSearch(e.target.value)} placeholder="Search and add services..." className="h-8 text-sm" />
                {filteredSvcSearch.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border rounded-lg max-h-32 overflow-y-auto">
                    {filteredSvcSearch.map((s) => (
                      <button key={s.id} onClick={() => addServiceToPackage(s)} className="w-full text-left px-3 py-1.5 hover:bg-secondary text-sm">
                        {s.name} — {formatPKR(s.base_price)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {formServices.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {formServices.map((fs) => (
                    <div key={fs.serviceId} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md text-sm">
                      <span className="flex-1">{fs.serviceName}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateServiceQty(fs.serviceId, fs.quantity - 1)} className="w-6 h-6 rounded border bg-background flex items-center justify-center text-xs">-</button>
                        <span className="w-6 text-center text-xs">{fs.quantity}</span>
                        <button onClick={() => updateServiceQty(fs.serviceId, fs.quantity + 1)} className="w-6 h-6 rounded border bg-background flex items-center justify-center text-xs">+</button>
                      </div>
                      <button onClick={() => removeServiceFromPackage(fs.serviceId)} className="text-muted-foreground hover:text-destructive text-xs">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm">Active</span>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button onClick={savePackage} disabled={saving} className="flex-1 bg-gold text-black border border-gold">{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
