'use client';

import { useRouter } from 'next/navigation';
import { Phone, AlertTriangle, CreditCard, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatPKR } from '@/lib/utils/currency';
import { formatTime, formatPKDate } from '@/lib/utils/dates';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';
import { updateAppointmentStatus } from '@/app/actions/appointments';
import type { AppointmentWithDetails, AppointmentStatus } from '@/types/database';

const STATUS_BADGE: Record<AppointmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  booked: { label: 'Booked', variant: 'default' },
  confirmed: { label: 'Confirmed', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'outline' },
  done: { label: 'Done', variant: 'secondary' },
  no_show: { label: 'No Show', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

interface AppointmentDetailProps {
  appointment: AppointmentWithDetails | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function AppointmentDetail({ appointment, open, onClose, onUpdated }: AppointmentDetailProps) {
  const router = useRouter();
  if (!appointment) return null;

  const apt = appointment;
  const totalPrice = apt.services?.reduce((sum, s) => sum + s.price, 0) || 0;
  const statusInfo = STATUS_BADGE[apt.status];

  async function updateStatus(status: AppointmentStatus) {
    try {
      const { error } = await updateAppointmentStatus(apt.id, status);
      if (error) throw new Error(error);

      toast.success(`Appointment ${status === 'done' ? 'completed' : status}`);
      onUpdated();

      if (status === 'done') {
        // Redirect to POS for checkout
        router.push(`/dashboard/pos?appointment=${apt.id}`);
      }
    } catch {
      toast.error('Failed to update status');
    }
  }

  function sendReminder() {
    if (!apt.client?.phone) { toast.error('No phone number'); return; }
    const message = `Reminder: Your appointment is at ${formatTime(apt.start_time)}. ${apt.staff?.name || ''} is waiting for you!`;
    const link = generateWhatsAppLink(apt.client.phone, message);
    window.open(link, '_blank');
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[350px] sm:w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading flex items-center gap-2">
            Appointment Details
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Client info */}
          <div className="p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center">
                {apt.client?.name?.charAt(0) || 'W'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{apt.client?.name || 'Walk-in'}</p>
                  {apt.client?.is_vip && <Badge variant="outline" className="text-[10px] text-gold border-gold">VIP</Badge>}
                </div>
                {apt.client?.phone && (
                  <a href={`tel:${apt.client.phone}`} className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {apt.client.phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Allergy warning */}
          {apt.client?.allergy_notes && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-xs">Allergy Warning</p>
                <p className="text-xs">{apt.client.allergy_notes}</p>
              </div>
            </div>
          )}

          {/* Udhaar warning */}
          {apt.client && apt.client.udhaar_balance > 0 && (
            <div className="flex items-start gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-600">
              <CreditCard className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-xs">Udhaar Outstanding</p>
                <p className="text-xs">{formatPKR(apt.client.udhaar_balance)}</p>
              </div>
            </div>
          )}

          {/* Appointment info */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{formatPKDate(apt.appointment_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span className="font-medium">{formatTime(apt.start_time)}{apt.end_time ? ` - ${formatTime(apt.end_time)}` : ''}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stylist</span>
              <span className="font-medium">{apt.staff?.name || '-'}</span>
            </div>
            {apt.is_walkin && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="outline" className="text-[10px]">Walk-in</Badge>
              </div>
            )}
          </div>

          <Separator />

          {/* Services */}
          <div>
            <h4 className="text-sm font-medium mb-2">Services</h4>
            <div className="space-y-1.5">
              {apt.services?.map((s) => (
                <div key={s.id} className="flex justify-between text-sm">
                  <span>{s.service_name}</span>
                  <span className="font-medium">{formatPKR(s.price)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t">
              <span>Total</span>
              <span>{formatPKR(totalPrice)}</span>
            </div>
          </div>

          {/* Notes */}
          {apt.notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-1">Notes</h4>
                <p className="text-sm text-muted-foreground">{apt.notes}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Status action buttons */}
          <div className="space-y-2">
            {apt.status === 'booked' && (
              <Button onClick={() => updateStatus('confirmed')} className="w-full bg-green-600 hover:bg-green-700 text-white">
                Confirm Appointment
              </Button>
            )}
            {(apt.status === 'booked' || apt.status === 'confirmed') && (
              <Button onClick={() => updateStatus('in_progress')} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                Start Service
              </Button>
            )}
            {apt.status === 'in_progress' && (
              <Button onClick={() => updateStatus('done')} className="w-full bg-gold hover:bg-gold/90 text-black border border-gold">
                Complete → Go to Checkout
              </Button>
            )}
            {apt.status !== 'done' && apt.status !== 'cancelled' && apt.status !== 'no_show' && (
              <>
                <Button onClick={() => updateStatus('no_show')} variant="outline" className="w-full text-red-600 border-red-500/20 hover:bg-red-500/10">
                  No Show
                </Button>
                <Button onClick={() => updateStatus('cancelled')} variant="outline" className="w-full text-muted-foreground">
                  Cancel Appointment
                </Button>
              </>
            )}
          </div>

          {/* Other actions */}
          <div className="space-y-2">
            {apt.client?.phone && (
              <Button variant="outline" onClick={sendReminder} className="w-full gap-2">
                <MessageCircle className="w-4 h-4" /> Send Reminder (WhatsApp)
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
