'use client';

import { useEffect, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { exitImpersonation, getImpersonationContext } from '@/app/actions/admin';

export function ImpersonationBanner() {
  const [state, setState] = useState<{ isImpersonating: boolean; salonName: string | null }>({
    isImpersonating: false,
    salonName: null,
  });
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    getImpersonationContext().then(setState);
  }, []);

  if (!state.isImpersonating) return null;

  async function exit() {
    setExiting(true);
    const { success, error, supabaseAuth } = await exitImpersonation();
    if (!success) {
      toast.error(error || 'Could not exit impersonation');
      setExiting(false);
      return;
    }
    // Flip the browser's Supabase Auth session off the owner. If the server
    // gave us a fresh token for the super admin, redeem it; otherwise sign out
    // and let them re-auth at /login.
    let redirectTo = '/admin';
    if (supabaseAuth) {
      const { error: otpErr } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: supabaseAuth.tokenHash,
      });
      if (otpErr) {
        await supabase.auth.signOut().catch(() => {});
        redirectTo = '/login';
      }
    } else {
      await supabase.auth.signOut().catch(() => {});
      redirectTo = '/login';
    }
    // Flip the client-side store back to super_admin so /admin doesn't get
    // stuck in the "not a super admin" branch after navigation.
    const s = useAppStore.getState();
    s.setSalon(null);
    s.setBranches([]);
    s.setCurrentBranch(null);
    s.setCurrentStaff(null);
    s.setCurrentPartner(null);
    s.setIsOwner(false);
    s.setIsPartner(false);
    s.setIsSuperAdmin(true);
    // The proxy derives role from the HttpOnly icut-token JWT, which
    // exitImpersonation() already reissued server-side with role=super_admin.
    // No client-side cookie writes — those were forgeable by any XSS.
    window.location.href = redirectTo;
  }

  return (
    <>
      {exiting && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
          <p className="text-sm font-medium text-foreground">Exiting impersonation…</p>
          <p className="text-xs text-muted-foreground">Returning to admin</p>
        </div>
      )}
      <div className="sticky top-0 z-50 bg-amber-500 text-black">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
          <Eye className="w-4 h-4 shrink-0" />
          <div className="flex-1 text-sm font-medium">
            <span className="font-semibold">Admin impersonation</span>
            {state.salonName ? ` — viewing ${state.salonName}` : ''}
            <span className="ml-2 opacity-70">Actions taken here affect the tenant&apos;s real data.</span>
          </div>
          <Button size="sm" variant="secondary" onClick={exit} disabled={exiting} className="bg-black text-white hover:bg-black/80">
            {exiting ? 'Exiting…' : 'Exit impersonation'}
          </Button>
        </div>
      </div>
    </>
  );
}
