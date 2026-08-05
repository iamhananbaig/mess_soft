import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Shield, PencilSimple } from '@phosphor-icons/react';

interface Role { id: number; name: string; permissions: { id: number; name: string }[]; }

const PERMISSION_GROUPS = [
  { label: 'POS', permissions: ['pos:use'] },
  { label: 'Categories', permissions: ['categories:view', 'categories:create', 'categories:edit', 'categories:delete'] },
  { label: 'Menu', permissions: ['menu:view', 'menu:create', 'menu:edit', 'menu:delete'] },
  { label: 'Recipes', permissions: ['recipes:manage'] },
  { label: 'Inventory', permissions: ['inventory:view', 'inventory:create', 'inventory:edit'] },
  { label: 'Sales', permissions: ['sales:create', 'sales:view'] },
  { label: 'Consumptions', permissions: ['consumptions:create', 'consumptions:view'] },
  { label: 'Reports', permissions: ['reports:view'] },
  { label: 'Employees', permissions: ['employees:view', 'employees:edit'] },
];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'super-admin': 'Full system access',
  'admin': 'Manages categories, menu, inventory, and employees',
  'manager': 'Operational access — inventory, sales, reports',
  'cashier': 'POS and sales only',
  'employee': 'Basic POS and consumption tracking',
};

export function PermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await api.get('/permissions');
      setRoles(r.data.roles);
    } catch {
      showToast('Failed to load permissions', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openEditor = (role: Role) => {
    setEditingRole(role);
    setDraft(role.permissions.map((p) => p.name));
    setSheetOpen(true);
  };

  const hasDraft = (perm: string) => draft.includes(perm);

  const togglePerm = (perm: string) => {
    setDraft((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const toggleGroup = (perms: string[]) => {
    setDraft((prev) => {
      const allSelected = perms.every((p) => prev.includes(p));
      if (allSelected) {
        return prev.filter((p) => !perms.includes(p));
      }
      return [...new Set([...prev, ...perms])];
    });
  };

  const isDirty = editingRole
    ? (() => {
        const original = new Set(editingRole.permissions.map((p) => p.name));
        const current = new Set(draft);
        if (original.size !== current.size) return true;
        for (const p of original) {
          if (!current.has(p)) return true;
        }
        return false;
      })()
    : false;

  const save = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      await api.put(`/permissions/${editingRole.id}`, { permissions: draft });
      showToast(`Permissions updated for ${editingRole.name}`, 'success');
      setSheetOpen(false);
      load();
    } catch {
      showToast('Failed to update permissions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    if (isDirty) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    setSheetOpen(false);
  }, [isDirty]);

  if (loading) return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Role Permissions" description="Manage what each role can access" />
      <TableSkeleton columns={4} />
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Role Permissions"
        description="Manage what each role can access"
        action={<Shield className="size-5 text-muted-foreground" />}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Role</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-32 text-center">Permissions</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <Badge variant="outline" className="capitalize font-medium">{role.name}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {ROLE_DESCRIPTIONS[role.name] ?? ''}
              </TableCell>
              <TableCell className="text-center">
                <span className="text-sm font-medium">{role.permissions.length}</span>
                <span className="text-muted-foreground text-sm"> / 19</span>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => openEditor(role)}>
                  <PencilSimple className="size-4 mr-1" />
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <SheetContent side="right" showCloseButton={false}>
          <SheetHeader>
            <SheetTitle>Edit Role: {editingRole?.name}</SheetTitle>
            <SheetDescription>
              Toggle permissions for this role. Changes are saved when you click Save.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {PERMISSION_GROUPS.map((group, idx) => {
              const allSelected = group.permissions.every((p) => hasDraft(p));

              return (
                <div key={group.label}>
                  {idx > 0 && <Separator className="my-4" />}
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">{group.label}</h4>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleGroup(group.permissions)}
                    >
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {group.permissions.map((perm) => (
                      <label
                        key={perm}
                        className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors has-[:checked]:bg-muted/80"
                      >
                        <Checkbox
                          checked={hasDraft(perm)}
                          onCheckedChange={() => togglePerm(perm)}
                        />
                        <span className="text-sm">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <SheetFooter>
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground">
                {draft.length} of 19 selected
                {isDirty && <span className="ml-2 text-amber-500 font-medium">Unsaved</span>}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                <Button
                  size="sm"
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={saving || !isDirty}
                  onClick={save}
                >
                  {saving ? <Spinner className="size-3 mr-1" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
