'use client';

import { useState, useEffect } from 'react';
import { Users, Shield, Store, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DEMO_USERS = [
  { name: 'iCut Admin', email: 'admin@icut.pk', role: 'Super Admin', salon: '— Platform', status: 'Active' },
  { name: 'Fatima Khan', email: 'fatima@glamourstudio.pk', role: 'Owner', salon: 'Glamour Studio', status: 'Active' },
  { name: 'Ahmed Raza', email: 'ahmed@royalbarbers.pk', role: 'Owner', salon: 'Royal Barbers', status: 'Active' },
  { name: 'Noor Fatima', email: 'noor@noorbeauty.pk', role: 'Owner', salon: 'Noor Beauty Lounge', status: 'Active' },
  { name: 'Usman Shah', email: 'usman@stylehub.pk', role: 'Owner', salon: 'Style Hub', status: 'Trial' },
];

interface StaffUser {
  name: string;
  email: string;
  role: string;
  salon: string;
  status: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>(DEMO_USERS);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ superAdmins: 1, owners: 4, totalStaff: 23 });

  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('*, salon:salons(name)')
          .order('name');

        if (error) throw error;

        if (data && data.length > 0) {
          const mapped: StaffUser[] = data.map((s: { name: string; email?: string; role: string; salon?: { name: string }; is_active?: boolean }) => ({
            name: s.name,
            email: s.email || '',
            role: s.role === 'super_admin' ? 'Super Admin' : s.role === 'owner' ? 'Owner' : s.role === 'senior_stylist' ? 'Senior Stylist' : s.role === 'junior_stylist' ? 'Junior Stylist' : s.role === 'receptionist' ? 'Receptionist' : s.role,
            salon: s.salon?.name || '— Platform',
            status: s.is_active ? 'Active' : 'Inactive',
          }));
          setUsers(mapped);

          const superAdmins = mapped.filter((u) => u.role === 'Super Admin').length || 1;
          const owners = mapped.filter((u) => u.role === 'Owner').length;
          setStats({ superAdmins, owners, totalStaff: mapped.length });
        }
      } catch {
        setUsers(DEMO_USERS);
        toast.error('Could not load live data — showing demo');
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
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-4">Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Salon</TableHead><TableHead className="text-center pr-4">Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.email || u.name}>
                  <TableCell className="pl-4 font-medium text-sm">{u.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant={u.role === 'Super Admin' ? 'destructive' : 'secondary'} className="text-[10px]">{u.role}</Badge></TableCell>
                  <TableCell className="text-sm">{u.salon}</TableCell>
                  <TableCell className="text-center pr-4">
                    <Badge variant="outline" className={`text-[10px] ${u.status === 'Active' ? 'text-green-600 border-green-500/25 bg-green-500/10' : 'text-amber-600 border-amber-500/25 bg-amber-500/10'}`}>{u.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
