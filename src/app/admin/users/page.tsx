'use client';

import { useState, useEffect } from 'react';
import { Users, Shield, Store, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminUsers } from '@/app/actions/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface StaffUser {
  name: string;
  email: string;
  role: string;
  salon: string;
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
  const [stats, setStats] = useState({ superAdmins: 1, owners: 0, totalStaff: 0 });

  useEffect(() => {
    async function fetchUsers() {
      try {
        const { staff, salons, partners } = await getAdminUsers();

        const mapped: StaffUser[] = staff.map((s: { name: string; email?: string; role: string; salon?: { name: string }; is_active?: boolean }) => ({
          name: s.name,
          email: s.email || '',
          role: ROLE_LABELS[s.role] || s.role,
          salon: s.salon?.name || '—',
          status: s.is_active !== false ? 'Active' : 'Inactive',
        }));

        // Add partners
        partners.forEach((p: { name: string; email?: string; salon?: { name: string }; is_active?: boolean }) => {
          mapped.push({
            name: p.name,
            email: p.email || '',
            role: 'Partner',
            salon: p.salon?.name || '—',
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
    fetchUsers();
  }, []);

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
              <TableHeader><TableRow>
                <TableHead className="pl-4">Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Salon</TableHead><TableHead className="text-center pr-4">Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users.map((u, i) => (
                  <TableRow key={`${u.email}-${i}`}>
                    <TableCell className="pl-4 font-medium text-sm">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant={u.role === 'Owner' ? 'default' : 'secondary'} className="text-[10px]">{u.role}</Badge></TableCell>
                    <TableCell className="text-sm">{u.salon}</TableCell>
                    <TableCell className="text-center pr-4">
                      <Badge variant="outline" className={`text-[10px] ${u.status === 'Active' ? 'text-green-600 border-green-500/25 bg-green-500/10' : 'text-amber-600 border-amber-500/25 bg-amber-500/10'}`}>{u.status}</Badge>
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
