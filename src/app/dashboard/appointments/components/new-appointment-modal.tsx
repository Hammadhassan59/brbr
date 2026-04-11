'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, AlertTriangle, X, Plus, User, Scissors } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatTime } from '@/lib/utils/dates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import { createAppointment, createAppointmentServices, updateAppointment, replaceAppointmentServices } from '@/app/actions/appointments';
import { createClient } from '@/app/actions/clients';
import type { AppointmentWithDetails, Client, Staff, Service, ServiceCategory, WorkingHours } from '@/types/database';

interface NewAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  prefillStaffId?: string | null;
  prefillTime?: string | null;
  prefillDate?: string | null;
  isWalkin?: boolean;
  prefillNotes?: string;
  editing?: AppointmentWithDetails | null;
}

const CATEGORIES: { value: ServiceCategory | 'all'; label: string }[] = [
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

const TIME_SLOTS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

export function NewAppointmentModal({
  open,
  onClose,
  onCreated,
  prefillStaffId,
  prefillTime,
  prefillDate,
  isWalkin = false,
  prefillNotes,
  editing = null,
}: NewAppointmentModalProps) {
  const { salon, currentBranch } = useAppStore();
  const isEditing = !!editing;

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  const [stylists, setStylists] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(prefillStaffId || '');

  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [serviceCategory, setServiceCategory] = useState('all');
  const [serviceSearch, setServiceSearch] = useState('');

  const [date, setDate] = useState(prefillDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(prefillTime || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !salon || !currentBranch) return;
    async function load() {
      const [staffRes, svcRes] = await Promise.all([
        supabase
          .from('staff')
          .select('*')
          .eq('branch_id', currentBranch!.id)
          .eq('is_active', true)
          .in('role', ['senior_stylist', 'junior_stylist'])
          .order('name'),
        supabase
          .from('services')
          .select('*')
          .eq('salon_id', salon!.id)
          .eq('is_active', true)
          .order('sort_order'),
      ]);
      if (staffRes.data) setStylists(staffRes.data as Staff[]);
      if (svcRes.data) setServices(svcRes.data as Service[]);
    }
    load();
  }, [open, salon, currentBranch]);

  useEffect(() => {
    if (prefillStaffId) setSelectedStaffId(prefillStaffId);
    if (prefillTime) setTime(prefillTime);
    if (prefillDate) setDate(prefillDate);
    if (prefillNotes) setNotes(prefillNotes);
  }, [prefillStaffId, prefillTime, prefillDate, prefillNotes]);

  // Hydrate form from the appointment being edited
  useEffect(() => {
    if (!open || !editing) return;
    setSelectedStaffId(editing.staff_id || '');
    setDate(editing.appointment_date);
    setTime(editing.start_time.slice(0, 5));
    setNotes(editing.notes || '');
    if (editing.client) {
      setSelectedClient(editing.client as Client);
    }
    if (editing.services && editing.services.length > 0) {
      // Rebuild Service[] shape from the stored snapshot. Duration fields in
      // appointment_services are the per-booking snapshot, not the current
      // catalog price/duration.
      setSelectedServices(
        editing.services.map((s) => ({
          id: s.service_id,
          salon_id: salon?.id || '',
          name: s.service_name,
          category: 'other' as ServiceCategory,
          base_price: s.price,
          duration_minutes: s.duration_minutes,
          is_active: true,
          sort_order: 0,
          created_at: '',
        } as Service))
      );
    }
  }, [open, editing, salon?.id]);

  const searchClients = useCallback(async (query: string) => {
    if (!salon || query.length < 2) { setClientResults([]); return; }
    const safe = query.replace(/[%_.,()]/g, '');
    if (!safe) { setClientResults([]); return; }
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('salon_id', salon.id)
      .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .limit(10);
    if (data) setClientResults(data as Client[]);
  }, [salon]);

  useEffect(() => {
    const timer = setTimeout(() => searchClients(clientSearch), 300);
    return () => clearTimeout(timer);
  }, [clientSearch, searchClients]);

  const filteredServices = services.filter((s) => {
    const matchCat = serviceCategory === 'all' || s.category === serviceCategory;
    const matchSearch = !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.base_price, 0);

  function toggleService(service: Service) {
    setSelectedServices((prev) =>
      prev.find((s) => s.id === service.id)
        ? prev.filter((s) => s.id !== service.id)
        : [...prev, service]
    );
  }

  function reset() {
    setClientSearch(''); setClientResults([]); setSelectedClient(null);
    setIsNewClient(false); setNewClientName(''); setNewClientPhone('');
    setSelectedStaffId(prefillStaffId || ''); setSelectedServices([]);
    setServiceCategory('all'); setServiceSearch('');
    setDate(prefillDate || new Date().toISOString().slice(0, 10));
    setTime(prefillTime || ''); setNotes('');
  }

  async function handleSave() {
    if (!salon || !currentBranch) return;
    if (!selectedStaffId) { toast.error('Select a stylist'); return; }
    if (selectedServices.length === 0) { toast.error('Select at least one service'); return; }
    if (!time) { toast.error('Select a time'); return; }

    setSaving(true);
    try {
      let clientId: string | null = null;

      if (isNewClient && newClientName) {
        const { data: newClient, error } = await createClient({ name: newClientName, phone: newClientPhone || null });
        if (error) throw new Error(error);
        clientId = newClient!.id;
      } else if (selectedClient) {
        clientId = selectedClient.id;
      }

      const [h, m] = time.split(':').map(Number);
      const endMinutes = h * 60 + m + totalDuration;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      // Conflict detection now runs inside createAppointment (ISSUE-018),
      // eliminating the client-side round-trip race window.

      if (currentBranch?.working_hours) {
        const dayNames: (keyof WorkingHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const selectedDay = dayNames[new Date(date + 'T00:00:00').getDay()];
        const daySchedule = currentBranch.working_hours[selectedDay];
        if (daySchedule && !daySchedule.off && endTime > daySchedule.close) {
          toast(`This appointment would end at ${formatTime(endTime)}, after closing time (${formatTime(daySchedule.close)})`, {
            icon: '⚠️', duration: 5000,
          });
        }
      }

      if (isEditing && editing) {
        const { error: aptErr } = await updateAppointment(editing.id, {
          branchId: currentBranch.id, clientId, staffId: selectedStaffId,
          date, startTime: time, endTime, notes: notes || null,
        });
        if (aptErr) throw new Error(aptErr);

        const { error: svcErr } = await replaceAppointmentServices(editing.id, selectedServices.map((s) => ({
          serviceId: s.id, serviceName: s.name,
          price: s.base_price, durationMinutes: s.duration_minutes,
        })));
        if (svcErr) throw new Error(svcErr);

        toast.success('Appointment updated');
      } else {
        const { data: apt, error: aptErr } = await createAppointment({
          branchId: currentBranch.id, clientId, staffId: selectedStaffId,
          date, startTime: time, endTime, isWalkin, notes: notes || null,
        });
        if (aptErr) throw new Error(aptErr);

        const { error: svcErr } = await createAppointmentServices(apt!.id, selectedServices.map((s) => ({
          serviceId: s.id, serviceName: s.name,
          price: s.base_price, durationMinutes: s.duration_minutes,
        })));
        if (svcErr) throw new Error(svcErr);

        toast.success('Appointment booked!');
      }
      reset(); onCreated(); onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create appointment');
    } finally {
      setSaving(false);
    }
  }

  const selectedStylist = stylists.find((s) => s.id === selectedStaffId);
  const isReady = selectedStaffId && selectedServices.length > 0 && time;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] p-0 flex flex-col overflow-hidden bg-background border-border rounded-lg">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0 bg-white">
          <DialogTitle className="font-heading text-lg font-bold text-foreground">
            {isEditing ? 'Edit Appointment' : isWalkin ? 'Add Walk-in' : 'New Appointment'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">{new Date(date + 'T00:00:00').toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{time ? ` at ${formatTime(time)}` : ''}</p>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-5 space-y-5" style={{ scrollbarWidth: 'none' }}>

          {/* Client */}
          <section className="bg-white rounded-lg p-4 border border-border">
            <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">Client (optional)</Label>
            {selectedClient ? (
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background">
                <div className="w-8 h-8 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">{selectedClient.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.phone}</p>
                </div>
                {selectedClient.is_vip && <Badge variant="outline" className="text-[10px]">VIP</Badge>}
                <button onClick={() => setSelectedClient(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
            ) : isNewClient ? (
              <div className="space-y-2 p-3 rounded-lg border border-border bg-background">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">New Client</span>
                  <button onClick={() => setIsNewClient(false)} className="text-xs text-gold hover:underline">Cancel</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Name" className="h-9" />
                  <Input value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} placeholder="Phone" className="h-9" />
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Search by name or phone..." className="pl-9 h-10 rounded-lg" />
                {clientSearch.length >= 2 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-border max-h-48 overflow-y-auto rounded-lg shadow-lg">
                    {clientResults.map((client) => (
                      <button key={client.id} onClick={() => { setSelectedClient(client); setClientSearch(''); setClientResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-background text-sm flex items-center gap-2 border-b last:border-0">
                        <div className="w-6 h-6 rounded-full bg-gold/15 text-gold text-[10px] font-bold flex items-center justify-center shrink-0">{client.name.charAt(0)}</div>
                        <span className="font-medium">{client.name}</span>
                        <span className="text-muted-foreground ml-auto text-xs">{client.phone}</span>
                      </button>
                    ))}
                    {clientResults.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No clients found</p>}
                    <button onClick={() => { setIsNewClient(true); setClientSearch(''); setClientResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-background text-sm text-gold border-t flex items-center gap-2">
                      <Plus className="w-3.5 h-3.5" /> Add new client
                    </button>
                  </div>
                )}
              </div>
            )}
            {selectedClient?.allergy_notes && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-red-500/10 border border-red-500/20 text-xs text-red-600">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Allergy: {selectedClient.allergy_notes}</span>
              </div>
            )}
          </section>

          {/* Stylist + Date/Time row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section className="bg-white rounded-lg p-4 border border-border">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">Stylist</Label>
              {stylists.length > 0 ? (
                <div className="space-y-1.5">
                  {stylists.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSelectedStaffId(s.id)}
                      aria-pressed={selectedStaffId === s.id}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                        selectedStaffId === s.id ? 'border-gold bg-gold/5' : 'border-border hover:border-gold/40'
                      }`}>
                      <div className={`w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                        selectedStaffId === s.id ? 'bg-gold text-black' : 'bg-background text-muted-foreground'
                      }`}>{s.name.charAt(0)}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{s.role.replace('_', ' ')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center rounded-lg bg-background border border-border">
                  <User className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">No stylists in this branch.</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Add staff in Settings first.</p>
                </div>
              )}
            </section>

            <section className="bg-white rounded-lg p-4 border border-border">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">Date & Time</Label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 w-full" />
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={1800} className="h-10 w-full" />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {TIME_SLOTS.map((slot) => {
                  const h = parseInt(slot.split(':')[0]);
                  const label = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTime(slot)}
                      aria-pressed={time === slot}
                      aria-label={`Select ${label}`}
                      className={`min-h-[44px] py-2.5 text-xs font-medium text-center transition-all rounded-lg ${
                        time === slot ? 'bg-gold text-black font-bold' : 'bg-background border border-border text-muted-foreground hover:border-gold/40 hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Services */}
          <section className="bg-white rounded-lg p-4 border border-border">
            <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
              Services {selectedServices.length > 0 && <span className="text-gold">({selectedServices.length})</span>}
            </Label>

            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setServiceCategory(cat.value)}
                  className={`px-3 py-1.5 text-xs font-medium shrink-0 transition-all rounded-full ${
                    serviceCategory === cat.value ? 'bg-foreground text-white' : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} placeholder="Search services..." className="pl-9 h-9 text-sm rounded-lg" />
            </div>

            {filteredServices.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {filteredServices.map((svc) => {
                  const isSelected = selectedServices.some((s) => s.id === svc.id);
                  return (
                    <button key={svc.id} type="button" onClick={() => toggleService(svc)}
                      aria-pressed={isSelected}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-left text-sm transition-all ${
                        isSelected ? 'border-gold bg-gold/5' : 'border-border hover:border-gold/30'
                      }`}>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{svc.name}</p>
                        <p className="text-[10px] text-muted-foreground">{svc.duration_minutes} min</p>
                      </div>
                      <span className="text-xs font-semibold tabular-nums shrink-0 ml-2">{formatPKR(svc.base_price)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center rounded-lg bg-background border border-border">
                <Scissors className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">No services found.</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Add services in Settings first.</p>
              </div>
            )}

            {selectedServices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedServices.map((s) => (
                  <Badge key={s.id} variant="secondary" className="gap-1 text-xs">
                    {s.name} <button onClick={() => toggleService(s)}><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </section>

          {/* Notes */}
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="rounded-lg text-sm bg-white border-border text-foreground" />
        </div>

        {/* Fixed bottom bar */}
        <div className="border-t border-border px-6 py-4 flex items-center gap-3 shrink-0 bg-white">
          <div className="flex-1 min-w-0">
            {selectedServices.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">{selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} · {totalDuration} min{time ? ` · ${formatTime(time)}` : ''}</p>
                <p className="font-heading font-bold text-lg leading-tight text-foreground">{formatPKR(totalPrice)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground/60">Select stylist, services, and time</p>
            )}
          </div>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} className="text-muted-foreground hover:text-foreground shrink-0">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !isReady}
            className="bg-gold hover:bg-gold/90 text-black font-bold h-11 px-8 shrink-0 disabled:opacity-30 rounded-lg">
            {saving ? (isEditing ? 'Saving...' : 'Booking...') : isEditing ? 'Save Changes' : 'Book'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
