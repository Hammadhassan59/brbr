import { createClient } from '@supabase/supabase-js';
import { createDemoClient } from './demo-db';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder';

const isDemoMode = !supabaseUrl || supabaseUrl.includes('placeholder');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = isDemoMode
  ? createDemoClient()
  : createClient(supabaseUrl, supabaseAnonKey);

// Server-side client for use in Server Components and Route Handlers
export function createServerClient() {
  if (isDemoMode) return createDemoClient();
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
