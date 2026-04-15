'use client';

import { useState, useEffect, useMemo } from 'react';
import { Users, Shield, Store, Loader2, Search, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminUsers } from '@/app/actions/admin';
import { toggleStaffActive, resetUserPassword } from '@/app/actions/admin-users';
import { formatPKDate } from '@/lib/utils/dates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roleKey: string;
  salon: string;
  isActive: boolean;
  lastLogin: string | null;
  type: 'owner' | 'staff' | 'partner';
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
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterSalon, setFilterSalon] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  async function fetchUsers() {
    try {
      const { staff, salons, partners, owners } = await getAdminUsers();

      const mapped: PlatformUser[] = [];

      // Add salon owners
      (owners as { id: string; name: string; email: string; salon_name: string }[]).forEach((o) => {
        mapped.push({
          id: o.id,
          name: o.name,
          email: o.email,
          role: 'Owner',
          roleKey: 'owner',
          salon: o.salon_name,
          isActive: true,
          lastLogin: null,
          type: 'owner',
        });
      });

      // Add staff
      staff.forEach((s: {
        id: string;
        name: string;
        email?: string;
        role: string;
        salon?: { name: string };
        is_active?: boolean;
        last_login_at?: string | null;
      }) => {
        mapped.push({
          id: s.id,
          name: s.name,
          email: s.email || '',
          role: ROLE_LABELS[s.role] || s.role,
          roleKey: s.role,
          salon: s.salon?.name || '—',
          isActive: s.is_active !== false,
          lastLogin: s.last_login_at ?? null,
          type: 'staff',
        });
      });

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
          roleKey: 'partner',
          salon: p.salon?.name || '—',
          isActive: p.is_active !== false,
          lastLogin: p.last_login_at ?? null,
          type: 'partner',
        });
      });

      setUsers(mapped);
    } catch {
      toast.error('Could not load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
     
  }, []);

  // Derived data
  const salonNames = useMemo(() => {
    const names = new Set<string>();
    users.forEach((u) => { if (u.salon !== '—') names.add(u.salon); });
    return Array.from(names).sort();
  }, [users]);

  const roleOptions = useMemo(() => {
    const roles = new Set<string>();
    users.forEach((u) => roles.add(u.role));
    return Array.from(roles).sort();
  }, [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      }
      if (filterRole !== 'all' && u.role !== filterRole) return false;
      if (filterSalon !== 'all' && u.salon !== filterSalon) return false;
      if (filterStatus === 'active' && !u.isActive) return false;
      if (filterStatus === 'inactive' && u.isActive) return false;
      return true;
    });
  }, [users, search, filterRole, filterSalon, filterStatus]);

  const stats = useMemo(() => ({
    superAdmins: 1,
    owners: users.filter((u) => u.type === 'owner').length,
    totalStaff: users.length,
  }), [users]);

  async function handleToggleActive(user: PlatformUser) {
    if (user.type === 'owner') {
      toast.error('Cannot deactivate salon owners from here');
      return;
    }
    const nextState = !user.isActive;
    const label = nextState ? 'activate' : 'deactivate';
    setActionLoading(`toggle-${user.id}`);
    try {
      await toggleStaffActive(user.id, nextState);
      toast.success(`${user.name} ${label}d`);
      setLoading(true);
      await fetchUsers();
    } catch {
      toast.error(`Failed to ${label} user`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetPassword(user: PlatformUser) {
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
    } catch {
      toast.error('Failed to reset password');
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
      <h2 className="font-heading text-lg sm:text-xl font-bold">Platform Users</h2>

      {/* Stats — clickable filters */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <button type="button" onClick={() => setFilterRole(filterRole === 'super_admin' ? 'all' : 'super_admin')} className={`text-left transition-all ${filterRole === 'super_admin' ? 'ring-2 ring-red-500/50' : ''}`}>
          <Card className="hover:border-red-500/30 cursor-pointer"><CardContent className="p-3 sm:p-4 text-center"><Shield className="w-5 h-5 text-red-500 mx-auto mb-1" /><p className="text-xl sm:text-2xl font-bold">{stats.superAdmins}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Super Admins</p></CardContent></Card>
        </button>
        <button type="button" onClick={() => setFilterRole(filterRole === 'owner' ? 'all' : 'owner')} className={`text-left transition-all ${filterRole === 'owner' ? 'ring-2 ring-gold/50' : ''}`}>
          <Card className="hover:border-gold/30 cursor-pointer"><CardContent className="p-3 sm:p-4 text-center"><Store className="w-5 h-5 text-gold mx-auto mb-1" /><p className="text-xl sm:text-2xl font-bold">{stats.owners}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Salon Owners</p></CardContent></Card>
        </button>
        <button type="button" onClick={() => { setFilterRole('all'); setFilterSalon('all'); setFilterStatus('all'); setSearch(''); }} className={`text-left transition-all ${filterRole === 'all' && filterSalon === 'all' && filterStatus === 'all' && !search ? 'ring-2 ring-blue-500/50' : ''}`}>
          <Card className="hover:border-blue-500/30 cursor-pointer"><CardContent className="p-3 sm:p-4 text-center"><Users className="w-5 h-5 text-blue-500 mx-auto mb-1" /><p className="text-xl sm:text-2xl font-bold">{stats.totalStaff}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Total Users</p></CardContent></Card>
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 sm:h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:flex sm:items-center gap-2">
              <div className="hidden sm:flex items-center">
                <Filter className="w-4 h-4 text-muted-foreground" />
              </div>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="h-10 sm:h-9 w-full sm:w-auto rounded-md border border-border bg-white px-3 text-sm"
              >
                <option value="all">All Roles</option>
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select
                value={filterSalon}
                onChange={(e) => setFilterSalon(e.target.value)}
                className="h-10 sm:h-9 w-full sm:w-auto rounded-md border border-border bg-white px-3 text-sm"
              >
                <option value="all">All Salons</option>
                {salonNames.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-10 sm:h-9 w-full sm:w-auto rounded-md border border-border bg-white px-3 text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          {(search || filterRole !== 'all' || filterSalon !== 'all' || filterStatus !== 'all') && (
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-muted-foreground">Showing {filtered.length} of {users.length} users</p>
              <button
                onClick={() => { setSearch(''); setFilterRole('all'); setFilterSalon('all'); setFilterStatus('all'); }}
                className="text-xs text-gold hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Platform Users ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="px-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {users.length === 0 ? 'No users yet. Staff will appear as salons add team members.' : 'No users match the current filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
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
                  {filtered.map((u, i) => (
                    <TableRow key={`${u.id}-${i}`}>
                      <TableCell className="pl-4 font-medium text-sm whitespace-nowrap">{u.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{u.email || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant={u.type === 'owner' ? 'default' : 'secondary'}
                          className={`text-[10px] ${u.type === 'owner' ? 'bg-gold text-black' : ''}`}
                        >
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{u.salon}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {u.lastLogin ? formatPKDate(u.lastLogin) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[10px] ${u.isActive ? 'text-green-600 border-green-500/25 bg-green-500/10' : 'text-amber-600 border-amber-500/25 bg-amber-500/10'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {u.type !== 'owner' && (
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={actionLoading === `toggle-${u.id}`}
                              className="text-[11px] px-2 py-1 border rounded font-medium disabled:opacity-50 hover:bg-muted transition-colors whitespace-nowrap"
                            >
                              {actionLoading === `toggle-${u.id}` ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                          {u.email && (
                            <button
                              onClick={() => handleResetPassword(u)}
                              disabled={actionLoading === `reset-${u.id}`}
                              className="text-[11px] px-2 py-1 border rounded font-medium disabled:opacity-50 hover:bg-muted transition-colors whitespace-nowrap"
                            >
                              {actionLoading === `reset-${u.id}` ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : 'Reset PW'}
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
