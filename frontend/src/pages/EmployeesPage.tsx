import { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { showToast, showErrorToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { PencilSimple, UserMinus, UserPlus, Key, Plus } from '@phosphor-icons/react';

interface Employee { id: number; name: string; email: string; is_active: boolean; roles: { name: string }[]; }

const ROLES = ['super-admin', 'admin', 'manager', 'cashier', 'employee'];

const ROLE_HINTS: Record<string, string> = {
  'super-admin': 'Everything',
  admin: 'Manage menu, stock, staff, receipt design',
  manager: 'Approves voids, reports',
  cashier: 'Enters sales, requests voids',
  employee: 'Enters sales, consumptions, requests voids',
};

/** Checkbox list — a user may hold several roles; their permissions combine. */
function RolePicker({ roles, value, onChange }: { roles: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {roles.map((r) => (
        <label key={r} className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-current"
            checked={value.includes(r)}
            onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))}
          />
          <span className="text-sm">
            <span className="font-medium capitalize">{r}</span>
            {ROLE_HINTS[r] && <span className="text-muted-foreground"> — {ROLE_HINTS[r]}</span>}
          </span>
        </label>
      ))}
      {value.length === 0 && <p className="text-xs text-destructive">Select at least one role.</p>}
    </div>
  );
}

const sameRoles = (a: string[], b: string[]) => a.length === b.length && a.every((r) => b.includes(r));

export function EmployeesPage() {
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('employees:edit');
  const isSuperAdmin = user?.roles.includes('super-admin') ?? false;
  const assignableRoles = isSuperAdmin ? ROLES : ROLES.filter((r) => r !== 'super-admin');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [form, setForm] = useState<{ name: string; roles: string[] }>({ name: '', roles: [] });
  const [search, setSearch] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', roles: ['cashier'] });
  const [resetFor, setResetFor] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const filtered = useMemo(() =>
    employees.filter((e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      e.roles.some((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    ), [employees, search]);

  const load = () => { api.get('/employees').then((r) => { setEmployees(r.data.data ?? r.data); }).catch(() => { showToast('Failed to load employees', 'error'); }).finally(() => { setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const openEdit = (emp: Employee) => {
    setSelected(emp);
    setForm({ name: emp.name, roles: emp.roles.map((r) => r.name) });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      if (selected) {
        await api.put(`/employees/${selected.id}`, { name: form.name });
        if (form.roles.length > 0 && !sameRoles(form.roles, selected.roles.map((r) => r.name))) {
          await api.post(`/employees/${selected.id}/role`, { roles: form.roles });
        }
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to update employee');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      await api.post('/employees', newUser);
      showToast(`${newUser.name} added — they can now log in with ${newUser.email}`, 'success');
      setCreateOpen(false);
      setNewUser({ name: '', email: '', password: '', roles: ['cashier'] });
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to add employee');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    setSubmitLoading(true);
    try {
      await api.put(`/employees/${resetFor.id}/password`, { password: newPassword });
      showToast(`Password changed for ${resetFor.name}. They have been signed out.`, 'success');
      setResetFor(null);
      setNewPassword('');
    } catch (err) {
      showErrorToast(err, 'Failed to change password');
    } finally {
      setSubmitLoading(false);
    }
  };

  const toggleActive = async (emp: Employee) => {
    setSubmitLoading(true);
    try {
      await api.put(`/employees/${emp.id}`, { is_active: !emp.is_active });
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to update employee');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader
        title="Employee Management"
        description="Manage staff accounts and roles"
        action={canEdit && (
          <Button onClick={() => setCreateOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="size-4 sm:mr-1" /><span className="hidden sm:inline">Add Employee</span>
          </Button>
        )}
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search employees..." />
      {loading ? <TableSkeleton columns={5} /> : filtered.length === 0 ? (
        <EmptyState title={search ? 'No employees match your search' : 'No employees found'} description={search ? 'Try a different search term' : 'Add your first employee'} />
      ) : (
        <>
        {/* Phone: cards with full-width actions */}
        <ul className="md:hidden space-y-2">
          {filtered.map((emp) => (
            <li key={emp.id} className={`rounded-xl border bg-card p-3 space-y-2 ${emp.is_active ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{emp.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{emp.email}</div>
                </div>
                <StatusBadge status={emp.is_active ? 'Active' : 'Inactive'} />
              </div>
              <div className="flex flex-wrap gap-1">
                {emp.roles.length ? emp.roles.map((r) => <StatusBadge key={r.name} status={r.name} />) : <StatusBadge status="none" />}
              </div>
              {canEdit && (
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => openEdit(emp)}><PencilSimple className="size-4 mr-1" />Edit</Button>
                  <Button variant="outline" size="sm" className="h-9" onClick={() => toggleActive(emp)} disabled={submitLoading}>
                    {emp.is_active ? <><UserMinus className="size-4 mr-1" />Disable</> : <><UserPlus className="size-4 mr-1" />Enable</>}
                  </Button>
                  {emp.id !== user?.id && (
                    <Button variant="outline" size="sm" className="h-9" onClick={() => { setNewPassword(''); setResetFor(emp); }}><Key className="size-4 mr-1" />Password</Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
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
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {emp.roles.length ? emp.roles.map((r) => <StatusBadge key={r.name} status={r.name} />) : <StatusBadge status="none" />}
                  </div>
                </TableCell>
                <TableCell><StatusBadge status={emp.is_active ? 'Active' : 'Inactive'} /></TableCell>
                <TableCell>
                    <div className="flex gap-1">
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => openEdit(emp)} />}>
                        <PencilSimple className="size-4" />
                      </TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => toggleActive(emp)} disabled={submitLoading} />}>
                        {emp.is_active ? <UserMinus className="size-4" /> : <UserPlus className="size-4" />}
                      </TooltipTrigger><TooltipContent>{emp.is_active ? 'Deactivate' : 'Activate'}</TooltipContent></Tooltip>
                      {emp.id !== user?.id && (
                        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" onClick={() => { setNewPassword(''); setResetFor(emp); }} />}>
                          <Key className="size-4" />
                        </TooltipTrigger><TooltipContent>Change password</TooltipContent></Tooltip>
                      )}
                    </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <FormField label="Name" required>
              <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required autoFocus />
            </FormField>
            <FormField label="Email (used to log in)" required>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} autoComplete="off" required />
            </FormField>
            <FormField label="Password (min 8 characters)" required>
              <Input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} minLength={8} autoComplete="new-password" required />
            </FormField>
            <FormField label="Roles" required>
              <RolePicker roles={assignableRoles} value={newUser.roles} onChange={(roles) => setNewUser({ ...newUser, roles })} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading || newUser.roles.length === 0}>Add Employee</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change password — {resetFor?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <FormField label="New password (min 8 characters)" required>
              <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} autoComplete="new-password" required autoFocus />
            </FormField>
            <p className="text-xs text-muted-foreground">They will be signed out on all devices and must log in with the new password.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetFor(null)}>Cancel</Button>
              <Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading || newPassword.length < 8}>Change password</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Roles">
              <RolePicker roles={assignableRoles} value={form.roles} onChange={(roles) => setForm({ ...form, roles })} />
            </FormField>
            <DialogFooter><Button type="submit" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={submitLoading || form.roles.length === 0}>Update</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
