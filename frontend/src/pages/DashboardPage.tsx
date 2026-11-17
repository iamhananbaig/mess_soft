import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { showErrorToast } from '@/lib/toast';
import { formatPKR, parseLocal } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { PageSpinner } from '@/components/PageSpinner';
import { ArrowClockwise, ArrowDown, ArrowUp, Prohibit, Vault, Package, Warning, CaretRight } from '@phosphor-icons/react';

interface DaySummary { revenue: number; transactions: number; average_ticket: number; cost: number; profit: number; voided_count: number; }
interface Dashboard {
  date: string;
  today: DaySummary;
  yesterday: DaySummary;
  trend: { date: string; revenue: number; profit: number; transactions: number }[];
  hourly: { hour: number; revenue: number; transactions: number }[];
  payments: { method: string; label: string; amount: number; count: number }[];
  top_items: { name: string; quantity: number; revenue: number; profit: number }[];
  alerts: {
    low_stock: { id: number; name: string; unit: string; current_stock: string; reorder_level: string }[];
    expiring: { id: number; name: string; unit: string; current_stock: string; expiry_date: string; expired: boolean }[];
    pending_voids: number;
    open_drawers: number;
    stock_value: number;
  };
}

const compact = (n: number) => (n >= 100000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const hourLabel = (h: number) => format(new Date(2000, 0, 1, h), 'ha').toLowerCase();

/** Today vs yesterday, as an arrow + percent (no colour-only meaning). */
function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return <span className="text-muted-foreground">vs yesterday —</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      <Icon className={cn('size-3', up ? 'text-green-600' : 'text-destructive')} weight="bold" />
      <span className="text-foreground font-medium tabular-nums">{Math.abs(pct)}%</span> vs yesterday
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader className="pb-0"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl md:text-3xl font-bold tabular-nums tracking-tight">{value}</div>
        {sub && <div className="mt-1 text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label, labelFormat }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string | number;
  labelFormat: (l: string | number) => string;
}) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-1 font-medium">{labelFormat(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{formatPKR(Math.round(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await api.get<Dashboard>('/dashboard')).data);
    } catch (err) {
      showErrorToast(err, 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Keep it fresh on a counter screen; cheap single request.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return loading ? <PageSpinner /> : null;

  const { today, yesterday, alerts } = data;
  const margin = today.revenue > 0 ? Math.round((today.profit / today.revenue) * 100) : null;

  // Show the trading window, not 24 empty hours.
  const activeHours = data.hourly.filter((h) => h.revenue > 0).map((h) => h.hour);
  const first = Math.min(8, ...activeHours);
  const last = Math.max(20, ...activeHours);
  const hourly = data.hourly.filter((h) => h.hour >= first && h.hour <= last);

  const trendTotal = data.trend.reduce((s, d) => s + d.revenue, 0);
  const topMax = Math.max(1, ...data.top_items.map((i) => i.revenue));
  const payTotal = data.payments.reduce((s, p) => s + p.amount, 0);

  const alertRows = [
    alerts.pending_voids > 0 && hasPermission('sales:void-approve') && { icon: Prohibit, text: `${alerts.pending_voids} void request${alerts.pending_voids > 1 ? 's' : ''} waiting for approval`, to: '/voids' },
    alerts.open_drawers > 0 && hasPermission('cash:close') && { icon: Vault, text: `${alerts.open_drawers} cash drawer${alerts.open_drawers > 1 ? 's' : ''} not closed today`, to: '/cash-closing' },
    alerts.low_stock.length > 0 && { icon: Package, text: `Low stock: ${alerts.low_stock.slice(0, 3).map((i) => i.name).join(', ')}${alerts.low_stock.length > 3 ? ` +${alerts.low_stock.length - 3} more` : ''}`, to: '/inventory' },
    alerts.expiring.length > 0 && { icon: Warning, text: `${alerts.expiring.filter((i) => i.expired).length ? `${alerts.expiring.filter((i) => i.expired).length} expired, ` : ''}${alerts.expiring.filter((i) => !i.expired).length} expiring within 7 days`, to: '/inventory' },
  ].filter(Boolean) as { icon: typeof Prohibit; text: string; to: string }[];

  return (
    <div className="viz-root flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader
        title="Dashboard"
        description={format(parseLocal(data.date), 'EEEE, d MMMM yyyy')}
        action={
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <ArrowClockwise className={cn('size-4', loading && 'animate-spin')} />
          </Button>
        }
      />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Sales today" value={formatPKR(today.revenue)} sub={<Delta now={today.revenue} before={yesterday.revenue} />} />
        <Tile label="Gross profit" value={formatPKR(Math.round(today.profit))} sub={<span className="text-muted-foreground">{margin !== null ? `${margin}% margin` : 'no sales yet'}</span>} />
        <Tile label="Transactions" value={String(today.transactions)} sub={<span className="text-muted-foreground">avg {formatPKR(today.average_ticket)}</span>} />
        <Tile label="Stock value" value={formatPKR(Math.round(alerts.stock_value))} sub={<span className="text-muted-foreground">{today.voided_count ? `${today.voided_count} voided today` : 'at average cost'}</span>} />
      </div>

      {/* Things that need someone's attention */}
      {alertRows.length > 0 && (
        <ul className="rounded-xl border divide-y bg-card">
          {alertRows.map((a) => (
            <li key={a.text}>
              <button type="button" onClick={() => navigate(a.to)} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-muted/50">
                <a.icon className="size-5 shrink-0 text-amber-600" />
                <span className="flex-1">{a.text}</span>
                <CaretRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 30-day trend: revenue & profit share one PKR axis */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">Last 30 days</CardTitle>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: 'var(--series-revenue)' }} /> Sales</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: 'var(--series-profit)' }} /> Profit</span>
              <span className="ml-auto tabular-nums">Total {formatPKR(trendTotal)}</span>
            </div>
          </CardHeader>
          <CardContent className="h-56 md:h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--series-revenue)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--series-revenue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11, fill: 'var(--viz-axis)' }}
                  tickFormatter={(d: string) => format(parseLocal(d), 'd MMM')} />
                <YAxis width={40} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} tickFormatter={compact} />
                <Tooltip cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
                  content={<ChartTooltip labelFormat={(l) => format(parseLocal(String(l)), 'EEE d MMM')} />} />
                <Area type="monotone" dataKey="revenue" name="Sales" stroke="var(--series-revenue)" strokeWidth={2} fill="url(#revFill)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="var(--series-profit)" strokeWidth={2} fill="none" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment mix today */}
        <Card>
          <CardHeader className="pb-0"><CardTitle className="text-sm">Payments today</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-3">
            {data.payments.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet today.</p> : data.payments.map((p) => (
              <div key={p.method} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{p.label} <span className="text-muted-foreground">· {p.count}</span></span>
                  <span className="font-medium tabular-nums">{formatPKR(p.amount)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full" style={{ width: `${(p.amount / payTotal) * 100}%`, background: 'var(--series-revenue)' }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Hourly rush */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0"><CardTitle className="text-sm">Sales by hour — today</CardTitle></CardHeader>
          <CardContent className="h-48 md:h-56 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} tickFormatter={hourLabel} />
                <YAxis width={40} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} tickFormatter={compact} />
                <Tooltip cursor={{ fill: 'var(--viz-grid)' }}
                  content={<ChartTooltip labelFormat={(h) => `${hourLabel(Number(h))}–${hourLabel((Number(h) + 1) % 24)}`} />} />
                <Bar dataKey="revenue" name="Sales" fill="var(--series-revenue)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top items */}
        <Card>
          <CardHeader className="pb-0"><CardTitle className="text-sm">Top items — 7 days</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-3">
            {data.top_items.length === 0 ? <p className="text-sm text-muted-foreground">No sales in the last week.</p> : data.top_items.map((i) => (
              <div key={i.name} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{i.name} <span className="text-muted-foreground">· {i.quantity}</span></span>
                  <span className="font-medium tabular-nums">{formatPKR(i.revenue)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full" style={{ width: `${(i.revenue / topMax) * 100}%`, background: 'var(--series-revenue)' }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
