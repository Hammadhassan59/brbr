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

/**
 * Send a one-off test email using caller-provided settings, so the super admin
 * can test BEFORE saving or AFTER saving — without depending on DB state.
 */
export async function sendTestEmail(params: {
  to: string;
  resendKey: string;
  fromEmail: string;
  fromName?: string;
}): Promise<{ sent: boolean; error: string | null }> {
  if (!params.resendKey || !params.fromEmail || !params.to) {
    return { sent: false, error: 'Missing API key, from email, or recipient' };
  }

  const from = params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail;
  const html = `
    <div style="font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1 style="font-size:22px;font-weight:bold;color:#1A1A1A;margin:0 0 16px 0;">iCut test email</h1>
      <p style="font-size:15px;line-height:1.6;color:#1A1A1A;margin:0 0 12px 0;">
        If you're reading this, your Resend setup is working.
      </p>
      <p style="font-size:13px;color:#1A1A1A;opacity:0.5;margin:16px 0 0 0;">
        Sent at ${new Date().toISOString()}.
      </p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: 'iCut — Resend test email',
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { sent: false, error: `Resend ${res.status}: ${text.slice(0, 300)}` };
    }
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
