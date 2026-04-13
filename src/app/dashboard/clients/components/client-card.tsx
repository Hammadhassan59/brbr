'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, Ban, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
import type { Client } from '@/types/database';

interface ClientCardProps {
  client: Client;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
}

export function ClientCard({ client, selected, onSelect }: ClientCardProps) {
  const router = useRouter();
  const { open: openWhatsApp } = useWhatsAppCompose();
  const initials = client.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700',
    'bg-pink-100 text-pink-700',
    'bg-teal-100 text-teal-700',
  ];
  const colorIndex = client.name.charCodeAt(0) % colors.length;

  return (
    <div className={`animate-fade-up bg-card border p-4 group/card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${selected ? 'ring-2 ring-gold border-gold/30' : 'border-border hover:border-gold/30'}`}>
      <div className="flex items-start gap-3">
        {onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(client.id, e.target.checked)}
            className="mt-1 rounded"
          />
        )}

        <Link href={`/dashboard/clients/${client.id}`} className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-11 h-11 rounded-lg ${colors[colorIndex]} flex items-center justify-center text-sm font-bold shrink-0`}>
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm font-semibold truncate">{client.name}</span>
              {client.is_vip && <Star className="w-3.5 h-3.5 text-gold fill-gold shrink-0" />}
              {client.is_blacklisted && <Ban className="w-3.5 h-3.5 text-destructive shrink-0" />}
            </div>

            {client.phone && (
              <p className="text-xs text-muted-foreground">{client.phone}</p>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-muted-foreground/80 font-medium">{client.total_visits} visits</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/80 font-medium">{formatPKR(client.total_spent)}</span>
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {client.loyalty_points > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-0.5">
                  <Star className="w-2.5 h-2.5" /> {client.loyalty_points} pts
                </Badge>
              )}
              {client.udhaar_balance > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {formatPKR(client.udhaar_balance)} owed
                </Badge>
              )}
            </div>
          </div>
        </Link>

        <div className="flex flex-col gap-1 shrink-0">
          {client.phone && (
            <button
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-green-50 transition-all duration-150"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openWhatsApp({
                  recipient: { name: client.name, phone: client.phone! },
                  template: 'custom',
                  variables: { name: client.name },
                });
              }}
              title="WhatsApp"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 transition-all duration-150"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/dashboard/clients/${client.id}`);
            }}
            title="Edit"
          >
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}
