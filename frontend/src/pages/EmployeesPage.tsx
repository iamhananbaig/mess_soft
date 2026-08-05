import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { PencilSimple, UserMinus, UserPlus } from '@phosphor-icons/react';

interface Employee { id: number; name: string; email: string; is_active: boolean; roles: { name: string }[]; }

const ROLES = ['super-admin', 'admin', 'manager', 'cashier', 'employee'];

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', role: '' });
  const [search, setSearch] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const filtered = useMemo(() =>
    employees.filter((e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      e.roles[0]?.name?.toLowerCase().includes(search.toLowerCase())
    ), [employees, search]);

  const load = () => { api.get('/employees').then((r) => { setEmployees(r.data.data ?? r.data); }).catch(() => {}).finally(() => { setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const openEdit = (emp: Employee) => {
    setSelected(emp);
    setForm({ name: emp.name, role: emp.roles[0]?.name ?? '' });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      if (selected) {
        await api.put(`/employees/${selected.id}`, { name: form.name });
        if (form.role) {
          await api.post(`/employees/${selected.id}/role`, { role: form.role });
        }
      }
      setDialogOpen(false);
      load();
    } catch {
      showToast('Failed to update employee', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const toggleActive = async (emp: Employee) => {
    setSubmitLoading(true);
    try {
      await api.put(`/employees/${emp.id}`, { is_active: !emp.is_active });
      load();
    } catch {
      showToast('Failed to update employee', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Employee Management" description="Manage staff accounts and roles" />
      <SearchInput value={search} onChange={setSearch} placeholder="Search employees..." />
      {loading ? <TableSkeleton columns={5} /> : filtered.length === 0 ? (
        <EmptyState title={search ? 'No employees match your search' : 'No employees found'} description={search ? 'Try a different search term' : 'Add your first employee'} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                <TableCell><StatusBadge status={emp.roles[0]?.name ?? 'none'} /></TableCell>
                <TableCell><StatusBadge status={emp.is_active ? 'Active' : 'Inactive'} /></TableCell>
                <TableCell>
                    <div className="flex gap-1">
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => openEdit(emp)} />}>
                        <PencilSimple className="size-4" />
                      </TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => toggleActive(emp)} disabled={submitLoading} />}>
                        {emp.is_active ? <UserMinus className="size-4" /> : <UserPlus className="size-4" />}
                      </TooltipTrigger><TooltipContent>{emp.is_active ? 'Deactivate' : 'Activate'}</TooltipContent></Tooltip>
                    </div>
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
            <FormField label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Role">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v ?? '' })}>
                <SelectTrigger><SelectValue placeholder="Select role">{form.role || undefined}</SelectValue></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                </SelectContent>
              </Select>
            </FormField>
            <DialogFooter><Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading}>Update</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
