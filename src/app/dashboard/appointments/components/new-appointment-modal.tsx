'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, AlertTriangle, X, Plus } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  // Client
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  // Stylist
  const [stylists, setStylists] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(prefillStaffId || '');

  // Services
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [serviceCategory, setServiceCategory] = useState('all');
  const [serviceSearch, setServiceSearch] = useState('');

  // Date/Time
  const [date, setDate] = useState(prefillDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(prefillTime || '');

  // Notes
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  // Load stylists and services
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

  // Update prefills when they change
  useEffect(() => {
    if (prefillStaffId) setSelectedStaffId(prefillStaffId);
    if (prefillTime) setTime(prefillTime);
    if (prefillDate) setDate(prefillDate);
    if (prefillNotes) setNotes(prefillNotes);
  }, [prefillStaffId, prefillTime, prefillDate, prefillNotes]);

  // Search clients
  const searchClients = useCallback(async (query: string) => {
    if (!salon || query.length < 2) {
      setClientResults([]);
      return;
    }
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('salon_id', salon.id)
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(10);
    if (data) setClientResults(data as Client[]);
  }, [salon]);

  useEffect(() => {
    const timer = setTimeout(() => searchClients(clientSearch), 300);
    return () => clearTimeout(timer);
  }, [clientSearch, searchClients]);

  // Filtered services
  const filteredServices = services.filter((s) => {
    const matchCat = serviceCategory === 'all' || s.category === serviceCategory;
    const matchSearch = !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // Total duration
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
    setClientSearch('');
    setClientResults([]);
    setSelectedClient(null);
    setIsNewClient(false);
    setNewClientName('');
    setNewClientPhone('');
    setSelectedStaffId(prefillStaffId || '');
    setSelectedServices([]);
    setServiceCategory('all');
    setServiceSearch('');
    setDate(prefillDate || new Date().toISOString().slice(0, 10));
    setTime(prefillTime || '');
    setNotes('');
  }

  async function handleSave() {
    if (!salon || !currentBranch) return;
    if (!selectedStaffId) { toast.error('Select a stylist'); return; }
    if (selectedServices.length === 0) { toast.error('Select at least one service'); return; }
    if (!time) { toast.error('Select a time'); return; }

    setSaving(true);
    try {
      let clientId: string | null = null;

      // Create new client if needed
      if (isNewClient && newClientName) {
        const { data: newClient, error } = await supabase
          .from('clients')
          .insert({
            salon_id: salon.id,
            name: newClientName,
            phone: newClientPhone || null,
          })
          .select()
          .single();
        if (error) throw error;
        clientId = newClient.id;
      } else if (selectedClient) {
        clientId = selectedClient.id;
      }

      // Calculate end time
      const [h, m] = time.split(':').map(Number);
      const endMinutes = h * 60 + m + totalDuration;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      // Check for scheduling conflicts with this stylist
      const { data: existingApts } = await supabase
        .from('appointments')
        .select('*, client:clients(name)')
        .eq('staff_id', selectedStaffId)
        .eq('appointment_date', date)
        .not('status', 'in', '("cancelled","no_show")');

      if (existingApts && existingApts.length > 0) {
        const conflict = existingApts.find((c: { start_time: string; end_time: string | null }) => {
          return c.start_time < endTime && (c.end_time || '23:59') > time;
        });
        if (conflict) {
          const stylistName = stylists.find((s) => s.id === selectedStaffId)?.name || 'This stylist';
          const conflictClient = (conflict as { client?: { name?: string } }).client?.name || 'Walk-in';
          toast.error(`${stylistName} is booked at ${formatTime(conflict.start_time)} — ${conflictClient}`);
          setSaving(false);
          return;
        }
      }

      // Warn if appointment extends past closing time (non-blocking)
      if (currentBranch?.working_hours) {
        const dayNames: (keyof WorkingHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const selectedDay = dayNames[new Date(date).getDay()];
        const daySchedule = currentBranch.working_hours[selectedDay];
        if (daySchedule && !daySchedule.off && endTime > daySchedule.close) {
          toast(`This appointment would end at ${formatTime(endTime)}, after closing time (${formatTime(daySchedule.close)})`, {
            icon: '⚠️',
            duration: 5000,
          });
        }
      }

      // Create appointment
      const { data: apt, error: aptErr } = await supabase
        .from('appointments')
        .insert({
          salon_id: salon.id,
          branch_id: currentBranch.id,
          client_id: clientId,
          staff_id: selectedStaffId,
          appointment_date: date,
          start_time: time,
          end_time: endTime,
          status: 'booked',
          is_walkin: isWalkin,
          notes: notes || null,
        })
        .select()
        .single();
      if (aptErr) throw aptErr;

      // Create appointment services
      const { error: svcErr } = await supabase
        .from('appointment_services')
        .insert(
          selectedServices.map((s) => ({
            appointment_id: apt.id,
            service_id: s.id,
            service_name: s.name,
            price: s.base_price,
            duration_minutes: s.duration_minutes,
          }))
        );
      if (svcErr) throw svcErr;

      toast.success('Appointment booked!');
      reset();
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create appointment';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {isWalkin ? 'Add Walk-in' : 'New Appointment'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client Selection */}
          <div>
            <Label className="mb-1.5 block">Client</Label>
            {selectedClient ? (
              <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
                <div className="w-8 h-8 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center">
                  {selectedClient.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.phone}</p>
                </div>
                {selectedClient.allergy_notes && (
                  <div className="flex items-center gap-1 text-destructive text-xs">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{selectedClient.allergy_notes}</span>
                  </div>
                )}
                <Button variant="ghost" size="icon" onClick={() => setSelectedClient(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : isNewClient ? (
              <div className="space-y-2 p-3 bg-secondary rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">New Client</span>
                  <Button variant="ghost" size="sm" onClick={() => setIsNewClient(false)}>
                    <X className="w-3 h-3 mr-1" /> Cancel
                  </Button>
                </div>
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Client name"
                />
                <Input
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="Phone (optional)"
                />
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="pl-9"
                />
                {clientSearch.length >= 2 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {clientResults.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => { setSelectedClient(client); setClientSearch(''); setClientResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-secondary text-sm flex items-center gap-2"
                      >
                        <span className="font-medium">{client.name}</span>
                        <span className="text-muted-foreground">{client.phone}</span>
                        {client.is_vip && <Badge variant="outline" className="text-[10px]">VIP</Badge>}
                      </button>
                    ))}
                    {clientResults.length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No results</p>
                    )}
                    <button
                      onClick={() => { setIsNewClient(true); setClientSearch(''); setClientResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-secondary text-sm text-gold border-t flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3" /> Walk-in / New Client
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stylist */}
          <div>
            <Label className="mb-1.5 block">Stylist</Label>
            <div className="flex flex-wrap gap-2">
              {stylists.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStaffId(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    selectedStaffId === s.id
                      ? 'border-gold bg-gold/10 text-foreground'
                      : 'border-border hover:border-gold/50'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-gold/20 text-gold text-[10px] font-bold flex items-center justify-center">
                    {s.name.charAt(0)}
                  </div>
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <Label className="mb-1.5 block">
              Services {selectedServices.length > 0 && `(${selectedServices.length})`}
            </Label>

            <Tabs value={serviceCategory} onValueChange={setServiceCategory}>
              <TabsList className="flex-wrap h-auto gap-1 mb-2">
                {CATEGORIES.map((cat) => (
                  <TabsTrigger key={cat.value} value={cat.value} className="text-xs px-2 py-1">
                    {cat.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Search services..."
                  className="pl-9 h-9 text-sm"
                />
              </div>

              <TabsContent value={serviceCategory} className="mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {filteredServices.map((svc) => {
                    const isSelected = selectedServices.some((s) => s.id === svc.id);
                    return (
                      <button
                        key={svc.id}
                        onClick={() => toggleService(svc)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-left text-sm transition-all ${
                          isSelected
                            ? 'border-gold bg-gold/10'
                            : 'border-border hover:border-gold/30'
                        }`}
                      >
                        <div>
                          <p className="font-medium">{svc.name}</p>
                          <p className="text-[10px] text-muted-foreground">{svc.duration_minutes}min</p>
                        </div>
                        <span className="text-xs font-medium">{formatPKR(svc.base_price)}</span>
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>

            {selectedServices.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedServices.map((s) => (
                  <Badge key={s.id} variant="secondary" className="gap-1">
                    {s.name}
                    <button onClick={() => toggleService(s)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {selectedServices.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Total: {Math.floor(totalDuration / 60) > 0 ? `${Math.floor(totalDuration / 60)}h ` : ''}
                {totalDuration % 60}min · {formatPKR(totalPrice)}
              </p>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Time</Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step={1800}
              />
            </div>
          </div>

          {/* Allergy warning */}
          {selectedClient?.allergy_notes && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Allergy Warning</p>
                <p className="text-xs">{selectedClient.allergy_notes}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="mb-1.5 block">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gold hover:bg-gold/90 text-black border border-gold"
            >
              {saving ? 'Saving...' : 'Confirm Appointment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
