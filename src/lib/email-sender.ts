'use server';

import { createServerClient } from '@/lib/supabase';

interface EmailSettings {
  enabled?: boolean;
  fromEmail?: string;
  fromName?: string;
  resendKey?: string;
  enabledTemplates?: Record<string, boolean>;
}

async function loadEmailSettings(): Promise<EmailSettings | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'email')
    .maybeSingle();
  return (data?.value as EmailSettings) ?? null;
}

/**
 * Send an email via Resend. Silently no-ops if email is disabled or
 * the API key is missing — we never want signup to fail because the
 * welcome email couldn't go out.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; error: string | null }> {
  const settings = await loadEmailSettings();
  if (!settings?.enabled || !settings.resendKey || !settings.fromEmail) {
    return { sent: false, error: 'Email not configured' };
  }

  try {
    const from = settings.fromName
      ? `${settings.fromName} <${settings.fromEmail}>`
      : settings.fromEmail;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
    }
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
