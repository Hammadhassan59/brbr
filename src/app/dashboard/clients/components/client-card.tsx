'use client';

import Link from 'next/link';
import { Star, AlertTriangle, Ban } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';
import type { Client } from '@/types/database';

interface ClientCardProps {
  client: Client;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
}

export function ClientCard({ client, selected, onSelect }: ClientCardProps) {
  const initials = client.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const colors = [
    'bg-blue-500/15 text-blue-600',
    'bg-green-500/15 text-green-600',
    'bg-purple-500/15 text-purple-600',
    'bg-amber-500/15 text-amber-600',
    'bg-pink-500/15 text-pink-600',
    'bg-teal-500/15 text-teal-600',
  ];
  const colorIndex = client.name.charCodeAt(0) % colors.length;

  return (
    <Card className={`hover:shadow-md transition-shadow ${selected ? 'ring-2 ring-gold' : ''}`}>
      <CardContent className="p-4">
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
            {/* Avatar */}
            <div className={`w-11 h-11 rounded-full ${colors[colorIndex]} flex items-center justify-center text-sm font-bold shrink-0`}>
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              {/* Name + badges */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-medium text-sm truncate">{client.name}</span>
                {client.is_vip && <Star className="w-3.5 h-3.5 text-gold fill-gold shrink-0" />}
                {client.is_blacklisted && <Ban className="w-3.5 h-3.5 text-destructive shrink-0" />}
              </div>

              {/* Phone */}
              {client.phone && (
                <p className="text-xs text-muted-foreground">{client.phone}</p>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{client.total_visits} visits</span>
                <span>·</span>
                <span>{formatPKR(client.total_spent)}</span>
              </div>

              {/* Loyalty + Udhaar */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
        </div>
      </CardContent>
    </Card>
  );
}
