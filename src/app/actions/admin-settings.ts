'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function getPlatformSettings(): Promise<Record<string, Record<string, unknown>>> {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value');

  if (error) throw error;

  const map: Record<string, Record<string, unknown>> = {};
  for (const row of data || []) {
    map[row.key] = row.value as Record<string, unknown>;
  }
  return map;
}

export async function savePlatformSetting(
  key: string,
  value: Record<string, unknown>,
): Promise<{ success: true }> {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw error;
  return { success: true };
}
