import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, Users, Wallet, LogOut } from 'lucide-react';
import { verifySession, destroySession } from '@/app/actions/auth';

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  let name = 'Agency';
  try {
    const session = await verifySession();
    if (session.role !== 'agency_admin' || !session.agencyId) {
      redirect('/login');
    }
    name = session.name || 'Agency';
  } catch {
    redirect('/login');
  }

  async function handleLogout() {
    'use server';
    await destroySession();
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold" />
            <span className="font-heading font-bold">iCut Agency</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/agency" className="px-3 py-1.5 rounded hover:bg-muted">Overview</Link>
            <Link href="/agency/agents" className="px-3 py-1.5 rounded hover:bg-muted inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Agents</Link>
            <Link href="/agency/commissions" className="px-3 py-1.5 rounded hover:bg-muted inline-flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Commissions</Link>
          </nav>
          <form action={handleLogout}>
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title={`Signed in as ${name}`}
            >
              <LogOut className="w-3.5 h-3.5" /> Log out
            </button>
          </form>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
