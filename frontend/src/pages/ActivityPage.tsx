import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import api from '@/services/api';
import { showErrorToast } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { FilterSelect, DateRangeFilter, type DateRange } from '@/components/ReportFilters';
import { ExportMenu } from '@/components/ExportMenu';
import { CaretDown } from '@phosphor-icons/react';

interface Log {
  id: number;
  action: string;
  description: string;
  changes: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  user: { id: number; name: string } | null;
}
interface Page { data: Log[]; current_page: number; last_page: number; total: number; }

const GROUPS: { value: string; label: string }[] = [
  { value: 'menu', label: 'Menu & prices' },
  { value: 'recipe', label: 'Recipes' },
  { value: 'category', label: 'Categories' },
  { value: 'inventory', label: 'Inventory items' },
  { value: 'stock', label: 'Stock movements' },
  { value: 'void', label: 'Voids' },
  { value: 'cash', label: 'Cash closing' },
  { value: 'employee', label: 'Staff accounts' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'settings', label: 'Settings' },
  { value: 'auth', label: 'Sign-ins' },
];

const tone = (action: string) =>
  action.startsWith('auth.failed') || action.startsWith('void.') || action.endsWith('deleted') || action.endsWith('deactivated')
    ? 'destructive' as const
    : action.startsWith('permissions') || action.startsWith('employee') || action.startsWith('settings') ? 'default' as const : 'secondary' as const;

const show = (v: unknown) => v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** Field-level before → after for updates; added/removed lists for permission changes. */
function Changes({ changes }: { changes: Record<string, unknown> }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/60 p-2 text-xs">
      {Object.entries(changes).map(([field, v]) => {
        const diff = v && typeof v === 'object' && 'from' in (v as object) ? (v as { from: unknown; to: unknown }) : null;
        return (
          <div key={field} className="contents">
            <dt className="font-medium text-muted-foreground">{field.replace(/_/g, ' ')}</dt>
            <dd className="break-words">
              {diff ? (<><span className="line-through text-muted-foreground">{show(diff.from)}</span> → <span className="font-medium">{show(diff.to)}</span></>) : show(v)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ActivityPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const [userId, setUserId] = useState('');
  const [group, setGroup] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DateRange>(() => ({ from: new Date(Date.now() - 6 * 864e5), to: new Date() }));
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ id: number; name: string }[]>('/employees')
      .then((r) => setUsers(r.data.map((u) => ({ value: String(u.id), label: u.name })))).catch(() => {});
  }, []);

  const params = useCallback((p: number) => ({
    page: p, per_page: 50,
    from: format(range.from, 'yyyy-MM-dd'), to: format(range.to, 'yyyy-MM-dd'),
    ...(userId && { user_id: userId }), ...(group && { action: group }), ...(search.trim() && { search: search.trim() }),
  }), [range, userId, group, search]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const r = await api.get<Page>('/activity', { params: params(p) });
      setLogs((prev) => (p === 1 ? r.data.data : [...prev, ...r.data.data]));
      setPage(r.data.current_page);
      setLastPage(r.data.last_page);
      setTotal(r.data.total);
    } catch (err) {
      showErrorToast(err, 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [params]);

  // Debounce typing in the search box.
  useEffect(() => { const t = setTimeout(() => load(1), 300); return () => clearTimeout(t); }, [load]);

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader title="Activity Log" description="Who changed what, and when — prices, recipes, stock, staff, permissions, voids, closings and sign-ins" />

      <div className="space-y-3 rounded-xl border bg-card p-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="People" value={userId} onChange={setUserId} options={users} />
          <FilterSelect label="Activity" value={group} onChange={setGroup} options={GROUPS} />
          <div className="flex-1 min-w-48"><SearchInput value={search} onChange={setSearch} placeholder="Search descriptions…" /></div>
          <ExportMenu build={() => ({
            filename: `activity_${format(range.from, 'yyyy-MM-dd')}_${format(range.to, 'yyyy-MM-dd')}`,
            heading: `Activity log — ${format(range.from, 'dd MMM yyyy')} – ${format(range.to, 'dd MMM yyyy')}`,
            subheading: logs.length < total ? `First ${logs.length} of ${total} entries (load more to include all)` : undefined,
            tables: [{ title: 'Activity', rows: logs, columns: [
              { header: 'When', value: (l: Log) => formatDateTime(l.created_at) },
              { header: 'Who', value: (l: Log) => l.user?.name ?? '—' },
              { header: 'Action', value: (l: Log) => l.action },
              { header: 'Description', value: (l: Log) => l.description, width: 50 },
              { header: 'Changes', value: (l: Log) => l.changes ? JSON.stringify(l.changes) : '', width: 40 },
              { header: 'IP', value: (l: Log) => l.ip ?? '' },
            ] }],
          })} disabled={!logs.length} />
        </div>
      </div>

      {loading && logs.length === 0 ? <TableSkeleton columns={4} /> : logs.length === 0 ? (
        <EmptyState title="No activity" description="Nothing matches these filters" />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{total} entr{total === 1 ? 'y' : 'ies'}</p>
          <ul className="divide-y rounded-xl border bg-card">
            {logs.map((l) => (
              <li key={l.id} className="px-3 py-2.5">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => setOpen(open === l.id ? null : l.id)}
                  disabled={!l.changes}
                  aria-expanded={open === l.id}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{l.description}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant={tone(l.action)} className="text-[10px]">{l.action}</Badge>
                      <span>{l.user?.name ?? 'Unknown'}</span>
                      <span>{formatDateTime(l.created_at)}</span>
                      {l.ip && <span className="hidden sm:inline">{l.ip}</span>}
                    </div>
                  </div>
                  {l.changes && <CaretDown className={cn('mt-1 size-4 text-muted-foreground transition-transform', open === l.id && 'rotate-180')} />}
                </button>
                {open === l.id && l.changes && <Changes changes={l.changes} />}
              </li>
            ))}
          </ul>
          {page < lastPage && (
            <Button variant="outline" className="self-center" onClick={() => load(page + 1)} disabled={loading}>Load more</Button>
          )}
        </>
      )}
    </div>
  );
}
