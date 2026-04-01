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
      {/* Greeting */}
      <div>
        <h2 className="font-heading text-xl font-bold">Welcome back, {staffName}!</h2>
        <p className="text-muted-foreground text-sm">Here&apos;s your day at a glance</p>
      </div>

      {/* Next appointment countdown */}
      {nextAppointment && (
        <Card className="border-gold/30 bg-gold/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Next: {nextAppointment.client?.name || 'Walk-in'}</p>
                <p className="text-xs text-muted-foreground">
                  {nextAppointment.services?.map((s) => s.service_name).join(', ')} at {formatTime(nextAppointment.start_time)}
                </p>
              </div>
              <Badge variant="outline" className="text-gold border-gold/30">
                Upcoming
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Earnings */}
      <div className="grid grid-cols-3 gap-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-12 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))
        ) : todayEarnings.services === 0 && todayEarnings.tips === 0 && monthlyCommission === 0 ? (
          <Card className="col-span-3">
            <CardContent className="p-5 text-center">
              <p className="text-sm text-muted-foreground">
                Complete your next appointment to start tracking earnings here
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-lg font-bold tabular-nums">{formatPKR(todayEarnings.services)}</p>
                <p className="text-[10px] text-muted-foreground">Services</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-lg font-bold tabular-nums">{formatPKR(todayEarnings.tips)}</p>
                <p className="text-[10px] text-muted-foreground">Tips</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <p className="text-lg font-bold tabular-nums">{formatPKR(monthlyCommission)}</p>
                <p className="text-[10px] text-muted-foreground">This Month</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Today's schedule */}
      <Card>
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
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    apt.status === 'done'
                      ? 'bg-muted/50 opacity-60'
                      : apt.status === 'in_progress'
                        ? 'border-amber-500/25 bg-amber-500/10'
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
