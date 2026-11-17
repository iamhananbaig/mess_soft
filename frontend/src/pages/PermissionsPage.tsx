import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/services/api';
import { showToast, showErrorToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { PencilSimple, LockSimple } from '@phosphor-icons/react';

interface Permission { id: number; name: string; }
interface Role { id: number; name: string; permissions: Permission[]; }

/**
 * Plain-English labels, grouped. Any permission the server has that isn't listed
 * here still appears under "Other", so new permissions can never be hidden.
 */
const PERMISSION_GROUPS: { label: string; permissions: [string, string][] }[] = [
  { label: 'Point of sale', permissions: [['pos:use', 'Use the POS'], ['sales:create', 'Make sales'], ['sales:view', 'View sales and reprint receipts']] },
  { label: 'Voids', permissions: [['sales:void-request', 'Request a void'], ['sales:void-approve', 'Approve or reject voids']] },
  { label: 'Cash closing', permissions: [['cash:close', 'Count & close cash drawers']] },
  { label: 'Reports & dashboard', permissions: [['reports:view', 'View dashboard and reports']] },
  { label: 'Menu', permissions: [['menu:view', 'View menu'], ['menu:create', 'Add menu items'], ['menu:edit', 'Edit menu items and prices'], ['menu:delete', 'Deactivate menu items']] },
  { label: 'Categories', permissions: [['categories:view', 'View categories'], ['categories:create', 'Add categories'], ['categories:edit', 'Rename categories'], ['categories:delete', 'Delete categories']] },
  { label: 'Recipes', permissions: [['recipes:manage', 'Edit recipes (ingredients per item)']] },
  { label: 'Inventory', permissions: [['inventory:view', 'View stock'], ['inventory:create', 'Add items and stock in'], ['inventory:edit', 'Edit items, adjust counts, write off expired']] },
  { label: 'Manual consumption', permissions: [['consumptions:view', 'View consumption'], ['consumptions:create', 'Record consumption (staff meals, damage…)']] },
  { label: 'Staff', permissions: [['employees:view', 'View employees'], ['employees:edit', 'Add employees, change roles & passwords, edit role permissions']] },
  { label: 'Settings', permissions: [['settings:manage', 'Change receipt design and payment methods']] },
  { label: 'Activity log', permissions: [['activity:view', 'View the activity log']] },
];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'super-admin': 'Everything. Can’t be edited.',
  admin: 'Runs the canteen: menu, stock, staff, settings',
  manager: 'Approves voids, closes cash, reports, stock-in',
  cashier: 'Registration staff: sells and requests voids',
  employee: 'Sells, requests voids, records consumption',
};

export function PermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await api.get<{ roles: Role[]; permissions: Permission[] }>('/permissions');
      setRoles(r.data.roles);
      setAllPermissions(r.data.permissions.map((p) => p.name));
    } catch (err) {
      showErrorToast(err, 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Known groups (only permissions the server actually has) + anything unknown.
  const groups = useMemo(() => {
    const known = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map(([p]) => p)));
    const listed = PERMISSION_GROUPS
      .map((g) => ({ ...g, permissions: g.permissions.filter(([p]) => allPermissions.includes(p)) }))
      .filter((g) => g.permissions.length > 0);
    const other = allPermissions.filter((p) => !known.has(p)).map((p): [string, string] => [p, p]);
    return other.length ? [...listed, { label: 'Other', permissions: other }] : listed;
  }, [allPermissions]);

  const total = allPermissions.length;
  const isLocked = (role: Role) => role.name === 'super-admin';

  const openEditor = (role: Role) => {
    setEditingRole(role);
    setDraft(role.permissions.map((p) => p.name));
  };

  const has = (perm: string) => draft.includes(perm);
  const toggle = (perm: string) => setDraft((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  const toggleGroup = (perms: string[]) => setDraft((prev) =>
    perms.every((p) => prev.includes(p)) ? prev.filter((p) => !perms.includes(p)) : [...new Set([...prev, ...perms])]);

  const isDirty = !!editingRole && (() => {
    const original = new Set(editingRole.permissions.map((p) => p.name));
    return original.size !== draft.length || draft.some((p) => !original.has(p));
  })();

  const save = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      await api.put(`/permissions/${editingRole.id}`, { permissions: draft });
      showToast(`Permissions updated for ${editingRole.name}`, 'success');
      setEditingRole(null);
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  const close = useCallback(() => {
    if (isDirty && !window.confirm('Discard your unsaved changes?')) return;
    setEditingRole(null);
  }, [isDirty]);

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader title="Role Permissions" description="What each role can do. A user with several roles gets all of their permissions." />

      {loading ? <TableSkeleton columns={3} /> : (
        <ul className="space-y-2">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize font-medium">{role.name}</Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">{role.permissions.length} / {total}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role.name] ?? ''}</p>
              </div>
              {isLocked(role) ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><LockSimple className="size-4" /> Locked</span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => openEditor(role)}>
                  <PencilSimple className="size-4 mr-1" /> Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!editingRole} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="capitalize">Edit role: {editingRole?.name}</SheetTitle>
            <SheetDescription>Tick what this role may do, then save.</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 space-y-5">
            {groups.map((group) => {
              const perms = group.permissions.map(([p]) => p);
              const allOn = perms.every(has);
              return (
                <section key={group.label}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">{group.label}</h4>
                    {perms.length > 1 && (
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => toggleGroup(perms)}>
                        {allOn ? 'Clear all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {group.permissions.map(([perm, label]) => (
                      <label key={perm} className="flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/50 has-[:checked]:bg-muted/70">
                        <Checkbox className="mt-0.5" checked={has(perm)} onCheckedChange={() => toggle(perm)} />
                        <span className="min-w-0">
                          <span className="block text-sm">{label}</span>
                          <span className="block text-[11px] text-muted-foreground font-mono">{perm}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <SheetFooter className="border-t">
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-xs text-muted-foreground">
                {draft.length} of {total} selected
                {isDirty && <span className="ml-2 text-amber-600 font-medium">Unsaved</span>}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
                <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={saving || !isDirty} onClick={save}>
                  {saving && <Spinner className="size-3 mr-1" />} Save
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
