'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
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
    const { success, error } = await exitImpersonation();
    if (!success) {
      toast.error(error || 'Could not exit impersonation');
      setExiting(false);
      return;
    }
    // Hard navigation so proxy.ts picks up the restored super_admin role cookie.
    window.location.href = '/admin';
  }

  return (
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
  );
}
