'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Shield, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { listAdminUsers, inviteAdmin, setAdminActive, updateAdminRole, type AdminUserRow } from '@/app/actions/admin-team';
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/admin-roles';

export default function AdminTeamPage() {
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listAdminUsers();
    if (error) toast.error(error);
    setAdmins(data);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function changeRole(adminId: string, role: AdminRole) {
    const { error } = await updateAdminRole(adminId, role);
    if (error) { toast.error(error); return; }
    toast.success('Role updated');
    load();
  }

  async function deactivate(adminId: string, active: boolean) {
    if (active && !confirm('Deactivate this admin? They will no longer be able to log in.')) return;
    const { error } = await setAdminActive(adminId, !active);
    if (error) { toast.error(error); return; }
    toast.success(active ? 'Deactivated' : 'Reactivated');
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-2xl font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" /> Admin Team
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has access to the admin panel and what they can see.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Invite admin
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : admins.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No admin team members yet.</p>
          <p className="text-xs mt-1">Bootstrap super admins are still defined via the SUPERADMIN_EMAILS env var.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Invited</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{a.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={a.role}
                      onChange={(e) => changeRole(a.id, e.target.value as AdminRole)}
                      disabled={!a.active}
                      className="border rounded-lg px-2 py-1 text-sm bg-white"
                    >
                      {ADMIN_ROLES.map((r) => (
                        <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.active ? 'bg-green-500/15 text-green-700' : 'bg-gray-500/15 text-gray-600'
                    }`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deactivate(a.id, a.active)}
                      className={`text-sm hover:underline ${a.active ? 'text-red-600' : 'text-gold'}`}
                    >
                      {a.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteDialog open={open} onClose={() => setOpen(false)} onInvited={load} />
    </div>
  );
}

function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('leads_team');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await inviteAdmin({ email: email.trim().toLowerCase(), role });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Invite sent — they will receive a password-setup email');
    setEmail('');
    setRole('leads_team');
    onClose();
    onInvited();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite an admin team member</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white mt-1"
            >
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {role === 'super_admin' && 'Full access to everything, can invite more admins.'}
              {role === 'technical_support' && 'Can view salons, payments, users, analytics, and platform settings.'}
              {role === 'customer_support' && 'Can view salons, payments, and users to help with billing/account issues.'}
              {role === 'leads_team' && 'Can view and update leads only. Cannot see payments, salons, or agents.'}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting || !email.trim()}>
              {submitting ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
