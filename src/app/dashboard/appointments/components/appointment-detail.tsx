'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, AlertTriangle, CreditCard, MessageCircle, Pencil } from 'lucide-react';
import { formatPKR } from '@/lib/utils/currency';
import { formatTime, formatPKDate } from '@/lib/utils/dates';
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
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
  onEdit?: (appointment: AppointmentWithDetails) => void;
}

export function AppointmentDetail({ appointment, open, onClose, onUpdated, onEdit }: AppointmentDetailProps) {
  const router = useRouter();
  const { open: openWhatsApp } = useWhatsAppCompose();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  if (!appointment) return null;

  const apt = appointment;
  const totalPrice = apt.services?.reduce((sum, s) => sum + s.price, 0) || 0;
  const statusInfo = STATUS_BADGE[apt.status];
  const canEdit = apt.status !== 'done' && apt.status !== 'cancelled';

  async function updateStatus(status: AppointmentStatus) {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const { error } = await updateAppointmentStatus(apt.id, status);
      if (showActionError(error)) return;

      toast.success(`Appointment ${status === 'done' ? 'completed' : status}`);
      onUpdated();

      if (status === 'done') {
        // Redirect to POS for checkout
        router.push(`/dashboard/pos?appointment=${apt.id}`);
      }
    } catch (err) {
      if (handleSubscriptionError(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  function sendReminder() {
    if (!apt.client?.phone) { toast.error('No phone number'); return; }
    openWhatsApp({
      recipient: { name: apt.client.name, phone: apt.client.phone },
      template: 'appointment_reminder',
      variables: { time: formatTime(apt.start_time), staff_name: apt.staff?.name || '' },
    });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[340px] sm:w-[400px] sm:max-w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading flex items-center gap-2">
            Appointment Details
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-4">
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
              <Button disabled={updatingStatus} onClick={() => updateStatus('confirmed')} className="w-full bg-green-600 hover:bg-green-700 text-white">
                Confirm Appointment
              </Button>
            )}
            {(apt.status === 'booked' || apt.status === 'confirmed') && (
              <Button disabled={updatingStatus} onClick={() => updateStatus('in_progress')} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                Start Service
              </Button>
            )}
            {apt.status === 'in_progress' && (
              <Button disabled={updatingStatus} onClick={() => updateStatus('done')} className="w-full bg-gold hover:bg-gold/90 text-black border border-gold">
                Complete → Go to Checkout
              </Button>
            )}
            {apt.status !== 'done' && apt.status !== 'cancelled' && apt.status !== 'no_show' && (
              <>
                <Button disabled={updatingStatus} onClick={() => updateStatus('no_show')} variant="outline" className="w-full text-red-600 border-red-500/20 hover:bg-red-500/10">
                  No Show
                </Button>
                <Button disabled={updatingStatus} onClick={() => updateStatus('cancelled')} variant="outline" className="w-full text-muted-foreground">
                  Cancel Appointment
                </Button>
              </>
            )}
          </div>

          {/* Other actions */}
          <div className="space-y-2">
            {canEdit && onEdit && (
              <Button
                variant="outline"
                onClick={() => { onEdit(apt); onClose(); }}
                className="w-full gap-2"
                aria-label="Edit appointment"
              >
                <Pencil className="w-4 h-4" aria-hidden="true" /> Edit Appointment
              </Button>
            )}
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
