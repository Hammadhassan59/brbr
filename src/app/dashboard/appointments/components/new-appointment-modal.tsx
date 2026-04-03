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
import type { Client, Staff, Service, ServiceCategory, WorkingHours } from '@/types/database';

interface NewAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  prefillStaffId?: string | null;
  prefillTime?: string | null;
  prefillDate?: string | null;
  isWalkin?: boolean;
  prefillNotes?: string;
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

const TIME_SLOTS = ['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

export function NewAppointmentModal({
  open,
  onClose,
  onCreated,
  prefillStaffId,
  prefillTime,
  prefillDate,
  isWalkin = false,
  prefillNotes,
}: NewAppointmentModalProps) {
  const { salon, currentBranch } = useAppStore();

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
        const { data: newClient, error } = await supabase
          .from('clients')
          .insert({ salon_id: salon.id, name: newClientName, phone: newClientPhone || null })
          .select().single();
        if (error) throw error;
        clientId = newClient.id;
      } else if (selectedClient) {
        clientId = selectedClient.id;
      }

      const [h, m] = time.split(':').map(Number);
      const endMinutes = h * 60 + m + totalDuration;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      const { data: existingApts } = await supabase
        .from('appointments')
        .select('*, client:clients(name)')
        .eq('staff_id', selectedStaffId)
        .eq('appointment_date', date)
        .not('status', 'in', '("cancelled","no_show")');

      if (existingApts && existingApts.length > 0) {
        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const conflict = existingApts.find((c: { start_time: string; end_time: string | null }) => {
          return toMin(c.start_time) < toMin(endTime) && toMin(c.end_time || '23:59') > toMin(time);
        });
        if (conflict) {
          const stylistName = stylists.find((s) => s.id === selectedStaffId)?.name || 'This stylist';
          const conflictClient = (conflict as { client?: { name?: string } }).client?.name || 'Walk-in';
          toast.error(`${stylistName} is booked at ${formatTime(conflict.start_time)} — ${conflictClient}`);
          setSaving(false);
          return;
        }
      }

      if (currentBranch?.working_hours) {
        const dayNames: (keyof WorkingHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const selectedDay = dayNames[new Date(date).getDay()];
        const daySchedule = currentBranch.working_hours[selectedDay];
        if (daySchedule && !daySchedule.off && endTime > daySchedule.close) {
          toast(`This appointment would end at ${formatTime(endTime)}, after closing time (${formatTime(daySchedule.close)})`, {
            icon: '⚠️', duration: 5000,
          });
        }
      }

      const { data: apt, error: aptErr } = await supabase
        .from('appointments')
        .insert({
          salon_id: salon.id, branch_id: currentBranch.id, client_id: clientId,
          staff_id: selectedStaffId, appointment_date: date, start_time: time,
          end_time: endTime, status: 'booked', is_walkin: isWalkin, notes: notes || null,
        })
        .select().single();
      if (aptErr) throw aptErr;

      const { error: svcErr } = await supabase
        .from('appointment_services')
        .insert(selectedServices.map((s) => ({
          appointment_id: apt.id, service_id: s.id, service_name: s.name,
          price: s.base_price, duration_minutes: s.duration_minutes,
        })));
      if (svcErr) throw svcErr;

      toast.success('Appointment booked!');
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
      <DialogContent className="calendar-card sm:max-w-xl max-h-[85vh] p-0 flex flex-col overflow-hidden bg-sidebar border-sidebar-border">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/30 shrink-0">
          <DialogTitle className="font-heading text-lg font-bold">
            {isWalkin ? 'Add Walk-in' : 'New Appointment'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">{new Date(date).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })}{time ? ` at ${formatTime(time)}` : ''}</p>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-5 space-y-5" style={{ scrollbarWidth: 'none' }}>

          {/* Client */}
          <section className="calendar-card bg-card p-4 border border-border/30">
            <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">Client (optional)</Label>
            {selectedClient ? (
              <div className="flex items-center gap-3 p-2.5 border bg-card">
                <div className="w-8 h-8 bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">{selectedClient.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.phone}</p>
                </div>
                {selectedClient.is_vip && <Badge variant="outline" className="text-[10px]">VIP</Badge>}
                <button onClick={() => setSelectedClient(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
            ) : isNewClient ? (
              <div className="space-y-2 p-3 border bg-secondary/30">
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
                <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Search by name or phone..." className="pl-9 h-10 calendar-card" />
                {clientSearch.length >= 2 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border shadow-lg max-h-48 overflow-y-auto">
                    {clientResults.map((client) => (
                      <button key={client.id} onClick={() => { setSelectedClient(client); setClientSearch(''); setClientResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-secondary text-sm flex items-center gap-2 border-b last:border-0">
                        <div className="w-6 h-6 bg-gold/15 text-gold text-[10px] font-bold flex items-center justify-center shrink-0">{client.name.charAt(0)}</div>
                        <span className="font-medium">{client.name}</span>
                        <span className="text-muted-foreground ml-auto text-xs">{client.phone}</span>
                      </button>
                    ))}
                    {clientResults.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No clients found</p>}
                    <button onClick={() => { setIsNewClient(true); setClientSearch(''); setClientResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-secondary text-sm text-gold border-t flex items-center gap-2">
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
            <section className="calendar-card bg-card p-4 border border-border/30">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">Stylist</Label>
              {stylists.length > 0 ? (
                <div className="space-y-1.5">
                  {stylists.map((s) => (
                    <button key={s.id} onClick={() => setSelectedStaffId(s.id)}
                      className={`w-full flex items-center gap-2.5 p-2.5 border text-left transition-all ${
                        selectedStaffId === s.id ? 'border-gold bg-gold/5' : 'border-border hover:border-gold/40'
                      }`}>
                      <div className={`w-7 h-7 text-[10px] font-bold flex items-center justify-center shrink-0 ${
                        selectedStaffId === s.id ? 'bg-gold text-black' : 'bg-secondary text-muted-foreground'
                      }`}>{s.name.charAt(0)}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{s.role.replace('_', ' ')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center calendar-card bg-background/50 border border-border/20">
                  <User className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">No stylists in this branch.</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Add staff in Settings first.</p>
                </div>
              )}
            </section>

            <section className="calendar-card bg-card p-4 border border-border/30">
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
                    <button key={slot} onClick={() => setTime(slot)}
                      className={`py-2.5 text-xs font-medium text-center transition-all calendar-card ${
                        time === slot ? 'bg-gold text-black font-bold' : 'bg-background/50 border border-border/30 text-muted-foreground hover:border-gold/40 hover:text-foreground'
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Services */}
          <section className="calendar-card bg-card p-4 border border-border/30">
            <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
              Services {selectedServices.length > 0 && <span className="text-gold">({selectedServices.length})</span>}
            </Label>

            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {CATEGORIES.map((cat) => (
                <button key={cat.value} onClick={() => setServiceCategory(cat.value)}
                  className={`px-3 py-1.5 text-xs font-medium shrink-0 transition-all calendar-card ${
                    serviceCategory === cat.value ? 'bg-gold/15 text-gold' : 'bg-background/50 text-muted-foreground hover:text-foreground'
                  }`}>{cat.label}</button>
              ))}
            </div>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} placeholder="Search services..." className="pl-9 h-9 text-sm calendar-card" />
            </div>

            {filteredServices.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {filteredServices.map((svc) => {
                  const isSelected = selectedServices.some((s) => s.id === svc.id);
                  return (
                    <button key={svc.id} onClick={() => toggleService(svc)}
                      className={`flex items-center justify-between p-2.5 border text-left text-sm transition-all ${
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
              <div className="py-8 text-center calendar-card bg-background/50 border border-border/20">
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
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="calendar-card text-sm bg-card border-border/30" />
        </div>

        {/* Fixed bottom bar */}
        <div className="border-t border-border/30 px-6 py-4 flex items-center gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            {selectedServices.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">{selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} · {totalDuration} min{time ? ` · ${formatTime(time)}` : ''}</p>
                <p className="font-heading font-bold text-lg leading-tight">{formatPKR(totalPrice)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground/60">Select stylist, services, and time</p>
            )}
          </div>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} className="text-muted-foreground hover:text-foreground shrink-0">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !isReady}
            className="calendar-card bg-gold hover:bg-gold/90 text-black border border-gold/50 font-bold h-11 px-8 shrink-0 disabled:opacity-30">
            {saving ? 'Booking...' : 'Book'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
