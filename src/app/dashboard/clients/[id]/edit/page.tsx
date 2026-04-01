'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ClientForm } from '../../components/client-form';
import type { Client } from '@/types/database';

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('clients').select('*').eq('id', clientId).single();
      if (data) setClient(data as Client);
      setLoading(false);
    }
    load();
  }, [clientId]);

  if (loading) return <div className="h-64 bg-muted rounded-lg animate-pulse" />;
  if (!client) return <div className="text-center py-16 text-muted-foreground">Client not found</div>;

  return <ClientForm client={client} onSaved={() => router.push(`/dashboard/clients/${clientId}`)} />;
}
