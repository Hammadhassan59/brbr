'use client';

import { Clock, DollarSign, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPKR } from '@/lib/utils/currency';
import { formatTime } from '@/lib/utils/dates';
import type { AppointmentWithDetails } from '@/types/database';

interface StylistDashboardProps {
  staffName: string;
  todayAppointments: AppointmentWithDetails[];
  todayEarnings: { services: number; tips: number };
  monthlyCommission: number;
  loading: boolean;
}

export function StylistDashboard({
  staffName,
  todayAppointments,
  todayEarnings,
  monthlyCommission,
  loading,
}: StylistDashboardProps) {
  const nextAppointment = todayAppointments.find(
    (a) => a.status === 'booked' || a.status === 'confirmed'
  );

  const completedCount = todayAppointments.filter((a) => a.status === 'done').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl font-bold">Welcome back, {staffName}!</h2>
        <p className="text-muted-foreground text-sm">Here&apos;s your day at a glance</p>
      </div>

      {nextAppointment && (
        <Card className="calendar-card bg-gold/10 border-gold/30 hover:border-border/60 transition-all duration-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-bold">Next: {nextAppointment.client?.name || 'Walk-in'}</p>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTime(nextAppointment.start_time)}</span>
                  <span className="mx-1">·</span>
                  <span>{nextAppointment.services?.map((s) => s.service_name).join(', ')}</span>
                </div>
              </div>
              <Badge variant="outline" className="text-gold border-gold/30">
                Upcoming
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Card key={i} className="calendar-card bg-card border border-border">
              <CardContent className="p-5">
                <div className="h-12 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))
        ) : todayEarnings.services === 0 && todayEarnings.tips === 0 && monthlyCommission === 0 ? (
          <Card className="calendar-card col-span-3 bg-card border border-border hover:border-border/60 transition-all duration-200">
            <CardContent className="p-5 text-center">
              <p className="text-sm text-muted-foreground">
                Complete your next appointment to start tracking earnings here
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="calendar-card bg-card border border-border hover:border-border/60 transition-all duration-200">
              <CardContent className="p-5">
                <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center mb-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Services</p>
                <p className="text-xl font-bold tabular-nums">{formatPKR(todayEarnings.services)}</p>
              </CardContent>
            </Card>
            <Card className="calendar-card bg-card border border-border hover:border-border/60 transition-all duration-200">
              <CardContent className="p-5">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center mb-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Tips</p>
                <p className="text-xl font-bold tabular-nums">{formatPKR(todayEarnings.tips)}</p>
              </CardContent>
            </Card>
            <Card className="calendar-card bg-card border border-border hover:border-border/60 transition-all duration-200">
              <CardContent className="p-5">
                <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center mb-2">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">This Month</p>
                <p className="text-xl font-bold tabular-nums">{formatPKR(monthlyCommission)}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="calendar-card bg-card border border-border hover:border-border/60 transition-all duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            My Schedule Today ({completedCount}/{todayAppointments.length} done)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayAppointments.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">
              No appointments scheduled
            </p>
          ) : (
            <div className="space-y-2">
              {todayAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className={`calendar-card flex items-center gap-3 bg-background/50 border border-border p-3 rounded-xl hover:border-border/60 transition-all duration-200 ${
                    apt.status === 'done'
                      ? 'opacity-60'
                      : apt.status === 'in_progress'
                        ? 'border-l-2 border-l-gold'
                        : ''
                  }`}
                >
                  <div className="text-center shrink-0 w-14">
                    <p className="text-sm font-mono font-medium">{formatTime(apt.start_time)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{apt.client?.name || 'Walk-in'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {apt.services?.map((s) => s.service_name).join(', ')}
                    </p>
                  </div>
                  <Badge
                    variant={apt.status === 'done' ? 'secondary' : apt.status === 'in_progress' ? 'outline' : 'default'}
                    className="text-[10px] shrink-0"
                  >
                    {apt.status === 'in_progress' ? 'In Progress' : apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
