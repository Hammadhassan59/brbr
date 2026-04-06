'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/components/providers/language-provider';
import { formatTime } from '@/lib/utils/dates';
import type { AppointmentWithDetails, AppointmentStatus } from '@/types/database';

const STATUS_STYLES: Record<AppointmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  booked: { label: 'Booked', variant: 'default' },
  confirmed: { label: 'Confirmed', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'outline' },
  done: { label: 'Done', variant: 'secondary' },
  no_show: { label: 'No Show', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const STATUS_DOT_COLORS: Record<AppointmentStatus, string> = {
  booked: 'bg-blue-500',
  confirmed: 'bg-green-500',
  in_progress: 'bg-amber-500',
  done: 'bg-gray-400',
  no_show: 'bg-red-500',
  cancelled: 'bg-red-300',
};

interface AppointmentsFeedProps {
  appointments: AppointmentWithDetails[];
  loading: boolean;
}

export function AppointmentsFeed({ appointments, loading }: AppointmentsFeedProps) {
  const { t } = useLanguage();

  return (
    <Card className="calendar-card bg-card border border-border sticky top-20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gold/20 flex items-center justify-center">
            <Clock className="w-4 h-4 text-gold" />
          </div>
          {t('todayAppointments')} ({appointments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="space-y-3 px-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 shimmer" />
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            No appointments today
          </p>
        ) : (
          <ScrollArea className="max-h-[calc(100vh-200px)]">
            <div className="space-y-2 px-3 stagger-children">
              {appointments.map((apt) => {
                const statusStyle = STATUS_STYLES[apt.status];
                return (
                  <Link
                    key={apt.id}
                    href={`/dashboard/appointments?id=${apt.id}`}
                    className="calendar-card flex items-center gap-3 bg-background/50 border border-border p-3 rounded-xl hover:border-border/60 transition-all duration-200 animate-fade-up"
                  >
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT_COLORS[apt.status]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium text-muted-foreground">
                          {formatTime(apt.start_time)}
                        </span>
                        <span className="text-sm font-semibold truncate">
                          {apt.client?.name || 'Walk-in'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">
                          {apt.services?.map((s) => s.service_name).join(', ') || 'No services'}
                        </span>
                        {apt.staff && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {apt.staff.name}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusStyle.variant} className="shrink-0 text-[10px] px-2.5 py-1">
                      {statusStyle.label}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
