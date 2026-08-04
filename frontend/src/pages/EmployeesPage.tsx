import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MagnifyingGlass, PencilSimple, UserMinus, UserPlus } from '@phosphor-icons/react';

interface Employee { id: number; name: string; email: string; is_active: boolean; roles: { name: string }[]; }

const ROLES = ['super-admin', 'admin', 'manager', 'cashier', 'employee'];

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', role: '' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() =>
    employees.filter((e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      e.roles[0]?.name?.toLowerCase().includes(search.toLowerCase())
    ), [employees, search]);

  const load = () => { api.get('/employees').then((r) => { setEmployees(r.data.data ?? r.data); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const openEdit = (emp: Employee) => {
    setSelected(emp);
    setForm({ name: emp.name, role: emp.roles[0]?.name ?? '' });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected) {
      await api.put(`/employees/${selected.id}`, { name: form.name });
      if (form.role) {
        await api.post(`/employees/${selected.id}/role`, { role: form.role });
      }
    }
    setDialogOpen(false);
    load();
  };

  const toggleActive = async (emp: Employee) => {
    await api.put(`/employees/${emp.id}`, { is_active: !emp.is_active });
    load();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Employee Management</h1>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                {search ? 'No employees match your search' : 'No employees found'}
              </TableCell></TableRow>
            ) : filtered.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell>{emp.email}</TableCell>
                <TableCell><Badge variant="outline">{emp.roles[0]?.name ?? 'none'}</Badge></TableCell>
                <TableCell>
                  <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <div className="flex gap-1">
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => openEdit(emp)} />}>
                          <PencilSimple className="size-4" />
                      </TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => toggleActive(emp)} />}>
                          {emp.is_active ? <UserMinus className="size-4" /> : <UserPlus className="size-4" />}
                      </TooltipTrigger><TooltipContent>{emp.is_active ? 'Deactivate' : 'Activate'}</TooltipContent></Tooltip>
                    </div>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select role">{form.role || undefined}</SelectValue></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter><Button type="submit">Update</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
