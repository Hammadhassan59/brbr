'use client';

import Link from 'next/link';
import { AlertTriangle, CreditCard, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/providers/language-provider';
import { formatPKR } from '@/lib/utils/currency';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';

interface AlertItem {
  type: 'low_stock' | 'udhaar' | 'no_show';
  label: string;
  detail: string;
  count?: number;
  amount?: number;
  action?: { label: string; href?: string; whatsapp?: { phone: string; message: string } };
}

interface AlertsPanelProps {
  alerts: AlertItem[];
  loading: boolean;
}

const ALERT_ICONS = {
  low_stock: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  udhaar: { icon: CreditCard, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  no_show: { icon: UserX, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
};

export function AlertsPanel({ alerts, loading }: AlertsPanelProps) {
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('alerts')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 shimmer" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">
            No alerts today
          </p>
        ) : (
          <div className="space-y-2 stagger-children">
            {alerts.map((alert, i) => {
              const style = ALERT_ICONS[alert.type];
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg ${style.bg} animate-fade-up`}
                >
                  <div className={`w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0`}>
                    <style.icon className={`w-4 h-4 ${style.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.label}</p>
                    <p className="text-xs text-muted-foreground">{alert.detail}</p>
                  </div>
                  {alert.action && (
                    alert.action.whatsapp ? (
                      <a
                        href={generateWhatsAppLink(alert.action.whatsapp.phone, alert.action.whatsapp.message)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" className="text-xs shrink-0 bg-gold text-black border border-gold hover:bg-gold/90">
                          {alert.action.label}
                        </Button>
                      </a>
                    ) : alert.action.href ? (
                      <Link href={alert.action.href}>
                        <Button size="sm" className="text-xs shrink-0 bg-gold text-black border border-gold hover:bg-gold/90">
                          {alert.action.label}
                        </Button>
                      </Link>
                    ) : null
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to build alerts from dashboard data
export function buildAlerts({
  lowStockCount,
  udhaarClients,
  udhaarTotal,
  noShowCount,
}: {
  lowStockCount: number;
  udhaarClients: number;
  udhaarTotal: number;
  noShowCount: number;
}): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (lowStockCount > 0) {
    alerts.push({
      type: 'low_stock',
      label: `${lowStockCount} products below threshold`,
      detail: 'Check inventory and reorder',
      action: { label: 'View Inventory', href: '/dashboard/inventory' },
    });
  }

  if (udhaarClients > 0) {
    alerts.push({
      type: 'udhaar',
      label: `${udhaarClients} clients owe ${formatPKR(udhaarTotal)}`,
      detail: 'Outstanding udhaar balance',
      action: { label: 'View Udhaar', href: '/dashboard/clients?tab=udhaar' },
    });
  }

  if (noShowCount > 0) {
    alerts.push({
      type: 'no_show',
      label: `${noShowCount} no-shows today`,
      detail: 'Clients who missed their appointment',
      action: { label: 'View Appointments', href: '/dashboard/appointments' },
    });
  }

  return alerts;
}
