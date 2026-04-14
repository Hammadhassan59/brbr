'use client';

import { useState, useEffect } from 'react';
import { Users, Shield, Store, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminUsers } from '@/app/actions/admin';
import { toggleStaffActive, resetUserPassword } from '@/app/actions/admin-users';
import { formatPKDate } from '@/lib/utils/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  salon: string;
  isActive: boolean;
  lastLogin: string | null;
  status: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
  senior_stylist: 'Senior Stylist',
  junior_stylist: 'Junior Stylist',
  helper: 'Helper',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [stats, setStats] = useState({ superAdmins: 1, owners: 0, totalStaff: 0 });

  async function fetchUsers() {
    try {
      const { staff, salons, partners } = await getAdminUsers();

      const mapped: StaffUser[] = staff.map((s: {
        id: string;
        name: string;
        email?: string;
        role: string;
        salon?: { name: string };
        is_active?: boolean;
        last_login_at?: string | null;
      }) => ({
        id: s.id,
        name: s.name,
        email: s.email || '',
        role: ROLE_LABELS[s.role] || s.role,
        salon: s.salon?.name || '—',
        isActive: s.is_active !== false,
        lastLogin: s.last_login_at ?? null,
        status: s.is_active !== false ? 'Active' : 'Inactive',
      }));

      // Add partners
      partners.forEach((p: {
        id: string;
        name: string;
        email?: string;
        salon?: { name: string };
        is_active?: boolean;
        last_login_at?: string | null;
      }) => {
        mapped.push({
          id: p.id,
          name: p.name,
          email: p.email || '',
          role: 'Partner',
          salon: p.salon?.name || '—',
          isActive: p.is_active !== false,
          lastLogin: p.last_login_at ?? null,
          status: p.is_active !== false ? 'Active' : 'Inactive',
        });
      });

      setUsers(mapped);

      const owners = mapped.filter((u) => u.role === 'Owner').length;
      setStats({ superAdmins: 1, owners, totalStaff: mapped.length });
    } catch {
      toast.error('Could not load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleActive(user: StaffUser) {
    const nextState = !user.isActive;
    const label = nextState ? 'activate' : 'deactivate';
    setActionLoading(`toggle-${user.id}`);
    try {
      await toggleStaffActive(user.id, nextState);
      toast.success(`${user.name} ${label}d`);
      setLoading(true);
      await fetchUsers();
    } catch (err) {
      toast.error(`Failed to ${label} user`);
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetPassword(user: StaffUser) {
    if (!user.email) {
      toast.error('No email address on file for this user');
      return;
    }
    const newPassword = window.prompt(`New password for ${user.name} (${user.email}):`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setActionLoading(`reset-${user.id}`);
    try {
      await resetUserPassword(user.email, newPassword);
      toast.success(`Password reset for ${user.name}`);
    } catch (err) {
      toast.error('Failed to reset password');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold">Platform Users</h2>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center"><Shield className="w-5 h-5 text-red-500 mx-auto mb-1" /><p className="text-2xl font-bold">{stats.superAdmins}</p><p className="text-xs text-muted-foreground">Super Admins</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Store className="w-5 h-5 text-gold mx-auto mb-1" /><p className="text-2xl font-bold">{stats.owners}</p><p className="text-xs text-muted-foreground">Salon Owners</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Users className="w-5 h-5 text-blue-500 mx-auto mb-1" /><p className="text-2xl font-bold">{stats.totalStaff}</p><p className="text-xs text-muted-foreground">Total Staff</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Platform Users</CardTitle></CardHeader>
        <CardContent className="px-0">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No users yet. Staff will appear as salons add team members.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Salon</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u, i) => (
                  <TableRow key={`${u.email}-${i}`}>
                    <TableCell className="pl-4 font-medium text-sm">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant={u.role === 'Owner' ? 'default' : 'secondary'} className="text-[10px]">{u.role}</Badge></TableCell>
                    <TableCell className="text-sm">{u.salon}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.lastLogin ? formatPKDate(u.lastLogin) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-[10px] ${u.isActive ? 'text-green-600 border-green-500/25 bg-green-500/10' : 'text-amber-600 border-amber-500/25 bg-amber-500/10'}`}>{u.status}</Badge>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={actionLoading === `toggle-${u.id}`}
                          className="text-[11px] px-2 py-1 border rounded font-medium disabled:opacity-50 hover:bg-muted transition-colors"
                        >
                          {actionLoading === `toggle-${u.id}` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleResetPassword(u)}
                          disabled={actionLoading === `reset-${u.id}`}
                          className="text-[11px] px-2 py-1 border rounded font-medium disabled:opacity-50 hover:bg-muted transition-colors"
                        >
                          {actionLoading === `reset-${u.id}` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : 'Reset PW'}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
