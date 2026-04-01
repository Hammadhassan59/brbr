'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { StaffForm } from '../../components/staff-form';
import type { Staff } from '@/types/database';

export default function EditStaffPage() {
  const params = useParams();
  const router = useRouter();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('staff').select('*').eq('id', params.id as string).single();
      if (data) setStaff(data as Staff);
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (loading) return <div className="h-64 bg-muted rounded-lg animate-pulse" />;
  if (!staff) return <p className="text-center py-16 text-muted-foreground">Staff not found</p>;

  return <StaffForm staff={staff} onSaved={() => router.push(`/dashboard/staff/${params.id}`)} />;
}
