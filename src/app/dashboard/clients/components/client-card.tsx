'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, Ban, MessageCircle, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
import type { Client } from '@/types/database';

interface ClientCardProps {
  client: Client;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
}

export function ClientCard({ client, selected, onSelect }: ClientCardProps) {
  const router = useRouter();
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
    <div className={`calendar-card bg-card border p-4 group/card transition-all duration-200 hover:shadow-md ${selected ? 'ring-2 ring-gold border-gold/30' : 'border-border hover:border-gold/30'}`}>
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
          <div className={`w-11 h-11 rounded-xl ${colors[colorIndex]} flex items-center justify-center text-sm font-bold shrink-0`}>
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
                <Badge variant="secondary" className="calendar-card text-[10px] gap-0.5">
                  <Star className="w-2.5 h-2.5" /> {client.loyalty_points} pts
                </Badge>
              )}
              {client.udhaar_balance > 0 && (
                <Badge variant="destructive" className="calendar-card text-[10px]">
                  {formatPKR(client.udhaar_balance)} owed
                </Badge>
              )}
            </div>
          </div>
        </Link>

        <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover/card:opacity-100 transition-all duration-200">
          {client.phone && (
            <Button
              variant="ghost"
              size="icon"
              className="calendar-card h-9 w-9 transition-all duration-150"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(generateWhatsAppLink(client.phone!, `Hi ${client.name}!`), '_blank');
              }}
              title="WhatsApp"
            >
              <MessageCircle className="w-4 h-4 text-green-500" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="calendar-card h-9 w-9 transition-all duration-150"
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
