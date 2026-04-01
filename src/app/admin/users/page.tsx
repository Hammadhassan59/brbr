'use client';

import { Users, Shield, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DEMO_USERS = [
  { name: 'BrBr Admin', email: 'admin@brbr.pk', role: 'Super Admin', salon: '— Platform', status: 'Active' },
  { name: 'Fatima Khan', email: 'fatima@glamourstudio.pk', role: 'Owner', salon: 'Glamour Studio', status: 'Active' },
  { name: 'Ahmed Raza', email: 'ahmed@royalbarbers.pk', role: 'Owner', salon: 'Royal Barbers', status: 'Active' },
  { name: 'Noor Fatima', email: 'noor@noorbeauty.pk', role: 'Owner', salon: 'Noor Beauty Lounge', status: 'Active' },
  { name: 'Usman Shah', email: 'usman@stylehub.pk', role: 'Owner', salon: 'Style Hub', status: 'Trial' },
];

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold">Platform Users</h2>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center"><Shield className="w-5 h-5 text-red-500 mx-auto mb-1" /><p className="text-2xl font-bold">1</p><p className="text-xs text-muted-foreground">Super Admins</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Store className="w-5 h-5 text-gold mx-auto mb-1" /><p className="text-2xl font-bold">4</p><p className="text-xs text-muted-foreground">Salon Owners</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Users className="w-5 h-5 text-blue-500 mx-auto mb-1" /><p className="text-2xl font-bold">23</p><p className="text-xs text-muted-foreground">Total Staff</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Owner Accounts</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-4">Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Salon</TableHead><TableHead className="text-center pr-4">Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {DEMO_USERS.map((u) => (
                <TableRow key={u.email}>
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
