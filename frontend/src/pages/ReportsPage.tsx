import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import api from '@/services/api';
import { showErrorToast } from '@/lib/toast';
import { formatPKR, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ExportDocument } from '@/lib/exporters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { DatePicker } from '@/components/DatePicker';
import { ReceiptModal } from '@/components/ReceiptModal';
import { PrintDialog } from '@/components/PrintDialog';
import { ExportMenu } from '@/components/ExportMenu';
import { FilterSelect, DateRangeFilter, type DateRange } from '@/components/ReportFilters';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { ArrowClockwise, Printer } from '@phosphor-icons/react';
import type { ReceiptData as FullReceiptData } from '@/types/receipt';

// ── Types ────────────────────────────────────────────────────────────

interface ItemRow {
  menu_item: { name: string; price?: number } | null;
  total_quantity: number | string;
  total_revenue: number | string;
  total_cost: number | string;
  profit?: number;
  margin?: number | null;
}
interface Daily {
  total_sales: number;
  total_transactions: number;
  items_sold: number;
  voided_count: number;
  voided_amount: number;
  total_cost: number;
  gross_profit: number;
  uncosted_quantity: number;
  payments: { method: string; label: string; count: number; amount: number }[];
  items: ItemRow[];
}
interface Receipt {
  id: number;
  created_at: string;
  payment_label?: string;
  payment_reference?: string | null;
  cashier?: string | null;
  total_amount: number;
  is_voided?: boolean;
  items: { item: string; price: number; quantity: number; amount: number }[];
}
interface StockRow {
  id: number; name: string; unit: string;
  opening: number; additions: number; pos_consumption: number; manual_consumption: number;
  expired: number; adjustments: number; void_returns: number; closing: number;
  avg_cost: number; closing_value: number;
}
interface LedgerMovement { id: number; date: string; source_label: string; quantity: number; balance: number; reference: string | null; note: string | null; user: string }
interface LedgerData {
  item: { id: number; name: string; unit: string };
  opening_stock: number;
  closing_stock: number;
  movements: LedgerMovement[];
}
interface WasteRow { date: string; item: string; unit: string; quantity: number; value: number; type: string; reason?: string; }
interface Payment { method: string; label: string; count: number; amount: number }
interface ReceiptLine { item: string; price: number; quantity: number; amount: number; r: Receipt }

type Tab = 'sales' | 'receipts' | 'items' | 'stock' | 'ledger' | 'waste';
const TABS: { key: Tab; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'items', label: 'Items & profit' },
  { key: 'stock', label: 'Stock summary' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'waste', label: 'Waste' },
];

const n = (v: number | string | null | undefined) => Number(v ?? 0);
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const nice = (d: Date) => format(d, 'dd MMM yyyy');
const qty = (v: number | string) => n(v).toLocaleString('en-PK', { maximumFractionDigits: 2 });

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: string }) {
  return (
    <Card size="sm">
      <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className={cn('text-xl md:text-2xl font-bold tabular-nums truncate', tone)}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  const [date, setDate] = useState<Date>(new Date());
  const [range, setRange] = useState<DateRange>(() => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: d }; });
  const [cashier, setCashier] = useState('');
  const [method, setMethod] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [ledgerItem, setLedgerItem] = useState('');
  const [inventory, setInventory] = useState<{ id: number; name: string }[]>([]);

  const [daily, setDaily] = useState<Daily | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [waste, setWaste] = useState<{ expired: WasteRow[]; manual: WasteRow[] }>({ expired: [], manual: [] });
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [printingId, setPrintingId] = useState<number | null>(null);
  const [modalData, setModalData] = useState<FullReceiptData | null>(null);
  const [printData, setPrintData] = useState<FullReceiptData | null>(null);

  const opts = useFilterOptions();

  const salesParams = useMemo(() => ({
    ...(cashier && { user_id: cashier }),
    ...(method && { payment_method: method }),
  }), [cashier, method]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'sales') {
        setDaily((await api.get('/reports/daily', { params: { date: ymd(date), ...salesParams, ...(category && { category_id: category }) } })).data);
      } else if (tab === 'receipts') {
        setReceipts((await api.get('/reports/receipts', { params: { date: ymd(date), ...salesParams, ...(status && { status }) } })).data.receipts ?? []);
      } else if (tab === 'items') {
        setItems((await api.get('/reports/items', { params: { from: ymd(range.from), to: ymd(range.to), ...salesParams, ...(category && { category_id: category }) } })).data);
      } else if (tab === 'stock') {
        setStock((await api.get('/reports/stock-summary', { params: { from: ymd(range.from), to: ymd(range.to) } })).data);
      } else if (tab === 'ledger') {
        if (ledgerItem) setLedger((await api.get('/reports/ledger', { params: { inventory_item_id: ledgerItem, from: ymd(range.from), to: ymd(range.to) } })).data);
      } else if (tab === 'waste') {
        setWaste((await api.get('/reports/waste', { params: { from: ymd(range.from), to: ymd(range.to) } })).data);
      }
    } catch (err) {
      showErrorToast(err, 'Failed to load report');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [tab, date, range, salesParams, category, status, ledgerItem]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'ledger' || inventory.length) return;
    api.get<{ id: number; name: string }[]>('/inventory').then((r) => {
      setInventory(r.data);
      if (!ledgerItem && r.data.length) setLedgerItem(String(r.data[0].id));
    }).catch(() => {});
  }, [tab, inventory.length, ledgerItem]);

  const openReceipt = async (saleId: number) => {
    setPrintingId(saleId);
    try {
      setModalData((await api.get(`/sales/${saleId}/receipt`)).data);
    } catch (err) {
      showErrorToast(err, 'Failed to load receipt');
    } finally {
      setPrintingId(null);
    }
  };

  // ── Filter description (used in exports) ──
  const label = (list: { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label;
  const filterText = [
    cashier && `Cashier: ${label(opts.cashiers, cashier)}`,
    method && `Payment: ${label(opts.methods, method)}`,
    category && (tab === 'sales' || tab === 'items') && `Category: ${label(opts.categories, category)}`,
    status && tab === 'receipts' && (status === 'voided' ? 'Voided only' : 'Valid only'),
  ].filter(Boolean).join(' · ');
  const rangeText = `${nice(range.from)} – ${nice(range.to)}`;

  // ── Export builders ──
  const buildExport = (): ExportDocument | null => {
    switch (tab) {
      case 'sales': return daily && {
        filename: `sales_${ymd(date)}`, heading: `Sales — ${nice(date)}`, subheading: filterText || undefined,
        tables: [
          { title: 'Items', rows: daily.items, columns: [
            { header: 'Item', value: (r: ItemRow) => r.menu_item?.name, width: 28 },
            { header: 'Qty', value: (r: ItemRow) => n(r.total_quantity), type: 'number' },
            { header: 'Revenue', value: (r: ItemRow) => n(r.total_revenue), type: 'money' },
            { header: 'Cost', value: (r: ItemRow) => n(r.total_cost), type: 'money' },
            { header: 'Profit', value: (r: ItemRow) => n(r.total_revenue) - n(r.total_cost), type: 'money' },
          ], totals: ['Total', daily.items_sold, daily.total_sales, daily.total_cost, daily.gross_profit] },
          { title: 'Payments', rows: daily.payments, columns: [
            { header: 'Method', value: (r: Payment) => r.label },
            { header: 'Sales', value: (r: Payment) => r.count, type: 'number' },
            { header: 'Amount', value: (r: Payment) => r.amount, type: 'money' },
          ] },
        ],
      };
      case 'receipts': return {
        filename: `receipts_${ymd(date)}`, heading: `Receipts — ${nice(date)}`, subheading: filterText || undefined,
        tables: [{ title: 'Receipts', rows: receipts.flatMap((r) => r.items.map((i): ReceiptLine => ({ ...i, r }))), columns: [
          { header: 'Receipt', value: (x: ReceiptLine) => `#${x.r.id}${x.r.is_voided ? ' (VOID)' : ''}` },
          { header: 'Time', value: (x: ReceiptLine) => formatDateTime(x.r.created_at) },
          { header: 'Cashier', value: (x: ReceiptLine) => x.r.cashier ?? '' },
          { header: 'Payment', value: (x: ReceiptLine) => x.r.payment_label ?? '' },
          { header: 'Item', value: (x: ReceiptLine) => x.item, width: 24 },
          { header: 'Qty', value: (x: ReceiptLine) => x.quantity, type: 'number' },
          { header: 'Price', value: (x: ReceiptLine) => x.price, type: 'money' },
          { header: 'Amount', value: (x: ReceiptLine) => x.amount, type: 'money' },
        ] }],
      };
      case 'items': return {
        filename: `items_${ymd(range.from)}_${ymd(range.to)}`, heading: `Items & profit — ${rangeText}`, subheading: filterText || undefined,
        tables: [{ title: 'Items', rows: items, columns: [
          { header: 'Item', value: (r: ItemRow) => r.menu_item?.name, width: 28 },
          { header: 'Qty', value: (r: ItemRow) => n(r.total_quantity), type: 'number' },
          { header: 'Revenue', value: (r: ItemRow) => n(r.total_revenue), type: 'money' },
          { header: 'Cost', value: (r: ItemRow) => n(r.total_cost), type: 'money' },
          { header: 'Profit', value: (r: ItemRow) => n(r.profit), type: 'money' },
          { header: 'Margin %', value: (r: ItemRow) => r.margin ?? '', type: 'number' },
        ], totals: ['Total', items.reduce((s, r) => s + n(r.total_quantity), 0), items.reduce((s, r) => s + n(r.total_revenue), 0),
          items.reduce((s, r) => s + n(r.total_cost), 0), items.reduce((s, r) => s + n(r.profit), 0), ''] }],
      };
      case 'stock': return {
        filename: `stock_summary_${ymd(range.from)}_${ymd(range.to)}`, heading: `Stock summary — ${rangeText}`,
        tables: [{ title: 'Stock', rows: stock, columns: [
          { header: 'Item', value: (r: StockRow) => r.name, width: 24 },
          { header: 'Unit', value: (r: StockRow) => r.unit },
          { header: 'Opening', value: (r: StockRow) => r.opening, type: 'number' },
          { header: 'In', value: (r: StockRow) => r.additions, type: 'number' },
          { header: 'Sold', value: (r: StockRow) => r.pos_consumption, type: 'number' },
          { header: 'Manual', value: (r: StockRow) => r.manual_consumption, type: 'number' },
          { header: 'Expired', value: (r: StockRow) => r.expired, type: 'number' },
          { header: 'Adjust', value: (r: StockRow) => r.adjustments, type: 'number' },
          { header: 'Voids', value: (r: StockRow) => r.void_returns, type: 'number' },
          { header: 'Closing', value: (r: StockRow) => r.closing, type: 'number' },
          { header: 'Value', value: (r: StockRow) => r.closing_value, type: 'money' },
        ], totals: ['Total', '', '', '', '', '', '', '', '', '', stock.reduce((s, r) => s + n(r.closing_value), 0)] }],
      };
      case 'ledger': return ledger && {
        filename: `ledger_${ledger.item.name}_${ymd(range.from)}`, heading: `Ledger — ${ledger.item.name} (${ledger.item.unit})`,
        subheading: `${rangeText} · opening ${qty(ledger.opening_stock)} · closing ${qty(ledger.closing_stock)}`,
        tables: [{ title: 'Movements', rows: ledger.movements, columns: [
          { header: 'Date', value: (m: LedgerMovement) => m.date },
          { header: 'Source', value: (m: LedgerMovement) => m.source_label },
          { header: 'Qty', value: (m: LedgerMovement) => m.quantity, type: 'number' },
          { header: 'Balance', value: (m: LedgerMovement) => m.balance, type: 'number' },
          { header: 'Ref', value: (m: LedgerMovement) => m.reference ?? '' },
          { header: 'Note', value: (m: LedgerMovement) => m.note ?? '', width: 24 },
          { header: 'By', value: (m: LedgerMovement) => m.user },
        ] }],
      };
      case 'waste': {
        const rows = [...waste.expired, ...waste.manual];
        return {
          filename: `waste_${ymd(range.from)}_${ymd(range.to)}`, heading: `Waste — ${rangeText}`,
          tables: [{ title: 'Waste', rows, columns: [
            { header: 'Date', value: (r: WasteRow) => r.date },
            { header: 'Type', value: (r: WasteRow) => (r.type === 'expiry' ? 'Expired' : 'Manual') },
            { header: 'Item', value: (r: WasteRow) => r.item, width: 22 },
            { header: 'Qty', value: (r: WasteRow) => n(r.quantity), type: 'number' },
            { header: 'Unit', value: (r: WasteRow) => r.unit },
            { header: 'Value', value: (r: WasteRow) => n(r.value), type: 'money' },
            { header: 'Reason', value: (r: WasteRow) => r.reason ?? '', width: 24 },
          ], totals: ['Total', '', '', '', '', rows.reduce((s, r) => s + n(r.value), 0), ''] }],
        };
      }
    }
  };

  // ── Filter bar ──
  const usesSingleDate = tab === 'sales' || tab === 'receipts';
  const usesSalesFilters = tab === 'sales' || tab === 'receipts' || tab === 'items';
  const anyFilter = cashier || method || category || status;

  const filters = (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      {usesSingleDate ? (
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker value={date} onChange={setDate} />
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>Today</Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(new Date(Date.now() - 864e5))}>Yesterday</Button>
        </div>
      ) : (
        <DateRangeFilter value={range} onChange={setRange} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {usesSalesFilters && opts.cashiers.length > 0 && <FilterSelect label="Cashiers" value={cashier} onChange={setCashier} options={opts.cashiers} />}
        {usesSalesFilters && opts.methods.length > 1 && <FilterSelect label="Payments" value={method} onChange={setMethod} options={opts.methods} />}
        {(tab === 'sales' || tab === 'items') && opts.categories.length > 0 && <FilterSelect label="Categories" value={category} onChange={setCategory} options={opts.categories} />}
        {tab === 'receipts' && (
          <FilterSelect label="Receipts" value={status} onChange={setStatus} options={[{ value: 'valid', label: 'Valid only' }, { value: 'voided', label: 'Voided only' }]} />
        )}
        {tab === 'ledger' && (
          <FilterSelect label="Items" value={ledgerItem} onChange={(v) => v && setLedgerItem(v)} options={inventory.map((i) => ({ value: String(i.id), label: i.name }))} className="min-w-48" />
        )}
        {anyFilter && usesSalesFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setCashier(''); setMethod(''); setCategory(''); setStatus(''); }}>Clear filters</Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-9" onClick={load} disabled={loading} aria-label="Refresh">
            <ArrowClockwise className={cn('size-4', loading && 'animate-spin')} />
          </Button>
          <ExportMenu build={buildExport} disabled={loading} />
        </div>
      </div>
    </div>
  );

  // ── Tab bodies ──
  const salesBody = daily && (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sales" value={formatPKR(daily.total_sales)}
          hint={daily.voided_count > 0 ? <span className="text-destructive">{daily.voided_count} voided ({formatPKR(daily.voided_amount)}) not counted</span> : `${daily.items_sold} items`} />
        <Stat label="Gross profit" value={formatPKR(Math.round(daily.gross_profit))} tone="text-green-600"
          hint={daily.total_sales > 0 ? `${Math.round((daily.gross_profit / daily.total_sales) * 100)}% · cost ${formatPKR(Math.round(daily.total_cost))}` : undefined} />
        <Stat label="Transactions" value={String(daily.total_transactions)}
          hint={daily.total_transactions ? `avg ${formatPKR(Math.round(daily.total_sales / daily.total_transactions))}` : undefined} />
        <Card size="sm">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">By payment</CardTitle></CardHeader>
          <CardContent className="space-y-0.5 text-sm">
            {daily.payments.length === 0 ? <span className="text-muted-foreground">—</span> : daily.payments.map((p) => (
              <div key={p.method} className="flex justify-between gap-2"><span>{p.label}</span><span className="tabular-nums font-medium">{formatPKR(p.amount)}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
      {daily.uncosted_quantity > 0 && (
        <p className="text-xs text-amber-600">{daily.uncosted_quantity} item(s) were sold before ingredient costs were entered — they have no cost, so profit is overstated for them.</p>
      )}
      {daily.items.length === 0 ? <EmptyState title="No sales on this date" /> : (
        <ItemTable rows={daily.items.map((r) => ({ ...r, profit: n(r.total_revenue) - n(r.total_cost) }))} />
      )}
    </div>
  );

  const receiptsBody = receipts.length === 0 ? <EmptyState title="No receipts" description="Nothing matches this date and filters" /> : (
    <ul className="space-y-2">
      {receipts.map((r) => (
        <li key={r.id} className={cn('rounded-xl border bg-card overflow-hidden', r.is_voided && 'opacity-70')}>
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <span className={cn('font-semibold', r.is_voided && 'line-through')}>#{r.id}</span>
            {r.is_voided && <Badge variant="destructive">Voided</Badge>}
            <span className="text-xs text-muted-foreground truncate">{formatDateTime(r.created_at)}{r.cashier && ` · ${r.cashier}`}</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">{r.payment_label}{r.payment_reference && ` · ${r.payment_reference}`}</span>
              <span className="font-semibold tabular-nums">{formatPKR(r.total_amount)}</span>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => openReceipt(r.id)} disabled={printingId === r.id} aria-label={`Reprint receipt ${r.id}`}>
                {printingId === r.id ? <Spinner className="size-4" /> : <Printer className="size-4" />}
              </Button>
            </span>
          </div>
          <ul className="px-3 py-2 text-sm space-y-0.5">
            {r.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="truncate">{i.quantity} × {i.item}</span>
                <span className="tabular-nums text-muted-foreground">{formatPKR(i.amount)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );

  const stockBody = stock.length === 0 ? <EmptyState title="No inventory items" /> : (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background">Item</TableHead>
            <TableHead className="text-right">Opening</TableHead>
            <TableHead className="text-right text-green-600">+ In</TableHead>
            <TableHead className="text-right text-red-600">− Sold</TableHead>
            <TableHead className="text-right text-red-600">− Manual</TableHead>
            <TableHead className="text-right text-red-600">− Expired</TableHead>
            <TableHead className="text-right text-amber-600">± Adjust</TableHead>
            <TableHead className="text-right text-green-600">+ Voids</TableHead>
            <TableHead className="text-right">Closing</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stock.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="sticky left-0 z-10 bg-background font-medium whitespace-nowrap">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></TableCell>
              {[r.opening, r.additions, r.pos_consumption, r.manual_consumption, r.expired, r.adjustments, r.void_returns].map((v, i) => (
                <TableCell key={i} className="text-right tabular-nums">{n(v) === 0 ? <span className="text-muted-foreground">—</span> : qty(i === 0 || i === 5 ? n(v) : Math.abs(n(v)))}</TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">{qty(r.closing)}</TableCell>
              <TableCell className="text-right tabular-nums">{n(r.closing_value) > 0 ? formatPKR(Math.round(n(r.closing_value))) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="sticky left-0 bg-muted font-semibold">Stock value</TableCell>
            <TableCell colSpan={8} />
            <TableCell className="text-right font-semibold tabular-nums">{formatPKR(Math.round(stock.reduce((s, r) => s + n(r.closing_value), 0)))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );

  const ledgerBody = !ledger ? <EmptyState title="Pick an item" /> : (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Opening" value={`${qty(ledger.opening_stock)} ${ledger.item.unit}`} />
        <Stat label="Closing" value={`${qty(ledger.closing_stock)} ${ledger.item.unit}`} />
      </div>
      {ledger.movements.length === 0 ? <EmptyState title="No movements in this period" /> : (
        <ul className="divide-y rounded-xl border bg-card">
          {ledger.movements.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{m.source_label}{m.reference && <span className="text-muted-foreground font-normal"> · {m.reference}</span>}</div>
                <div className="text-xs text-muted-foreground truncate">{m.date} · {m.user}{m.note && ` · ${m.note}`}</div>
              </div>
              <div className="text-right">
                <div className={cn('font-semibold tabular-nums', m.quantity >= 0 ? 'text-green-600' : 'text-red-600')}>{m.quantity >= 0 ? '+' : '−'}{qty(Math.abs(m.quantity))}</div>
                <div className="text-xs text-muted-foreground tabular-nums">bal {qty(m.balance)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const wasteRows = [...waste.expired, ...waste.manual].sort((a, b) => b.date.localeCompare(a.date));
  const wasteBody = wasteRows.length === 0 ? <EmptyState title="No waste in this period" /> : (
    <div className="space-y-3">
      <Stat label="Waste value" value={formatPKR(Math.round(wasteRows.reduce((s, r) => s + n(r.value), 0)))} tone="text-destructive"
        hint={`${waste.expired.length} expiry write-offs · ${waste.manual.length} manual`} />
      <ul className="divide-y rounded-xl border bg-card">
        {wasteRows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Badge variant={r.type === 'expiry' ? 'destructive' : 'secondary'}>{r.type === 'expiry' ? 'Expired' : 'Manual'}</Badge>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.item}</div>
              <div className="text-xs text-muted-foreground truncate">{r.date}{r.reason && ` · ${r.reason}`}</div>
            </div>
            <div className="text-right">
              <div className="tabular-nums">{qty(r.quantity)} {r.unit}</div>
              {n(r.value) > 0 && <div className="text-xs text-muted-foreground tabular-nums">{formatPKR(Math.round(n(r.value)))}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  const body: Record<Tab, React.ReactNode> = {
    sales: salesBody,
    receipts: receiptsBody,
    items: items.length === 0 ? <EmptyState title="No sales in this period" /> : <ItemTable rows={items} />,
    stock: stockBody,
    ledger: ledgerBody,
    waste: wasteBody,
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader title="Reports" description="Sales, profit, stock and waste — filter, then export to Excel or PDF" />

      <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn('shrink-0 h-9 rounded-full border px-4 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filters}

      {!loadedOnce ? <TableSkeleton columns={5} /> : (
        <div className={cn('transition-opacity', loading && 'opacity-60')}>{body[tab]}</div>
      )}

      <ReceiptModal data={modalData} open={!!modalData} onOpenChange={(o) => !o && setModalData(null)} onPrint={(d) => { setModalData(null); setPrintData(d); }} />
      <PrintDialog data={printData} open={!!printData} onOpenChange={(o) => !o && setPrintData(null)} reprint />
    </div>
  );
}

/** Items with qty, revenue, cost, profit, margin. Cards on phones, table on desktop. */
function ItemTable({ rows }: { rows: ItemRow[] }) {
  const sorted = [...rows].sort((a, b) => n(b.total_revenue) - n(a.total_revenue));
  const margin = (r: ItemRow) => r.margin ?? (n(r.total_revenue) > 0 ? Math.round(((n(r.total_revenue) - n(r.total_cost)) / n(r.total_revenue)) * 1000) / 10 : null);
  const profit = (r: ItemRow) => r.profit ?? n(r.total_revenue) - n(r.total_cost);
  const tone = (m: number | null) => m === null ? '' : m < 0 ? 'text-destructive' : m < 30 ? 'text-amber-600' : 'text-green-600';

  return (
    <>
      <ul className="md:hidden divide-y rounded-xl border bg-card">
        {sorted.map((r, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.menu_item?.name ?? 'Item'}</div>
              <div className="text-xs text-muted-foreground">{qty(r.total_quantity)} sold · profit {formatPKR(Math.round(profit(r)))}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular-nums">{formatPKR(Math.round(n(r.total_revenue)))}</div>
              {n(r.total_cost) > 0 && <div className={cn('text-xs font-medium', tone(margin(r)))}>{margin(r)}%</div>}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.menu_item?.name ?? 'Item'}</TableCell>
                <TableCell className="text-right tabular-nums">{qty(r.total_quantity)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(Math.round(n(r.total_revenue)))}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{n(r.total_cost) > 0 ? formatPKR(Math.round(n(r.total_cost))) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPKR(Math.round(profit(r)))}</TableCell>
                <TableCell className={cn('text-right font-medium', tone(margin(r)))}>{n(r.total_cost) > 0 ? `${margin(r)}%` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right tabular-nums">{qty(rows.reduce((s, r) => s + n(r.total_quantity), 0))}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{formatPKR(Math.round(rows.reduce((s, r) => s + n(r.total_revenue), 0)))}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPKR(Math.round(rows.reduce((s, r) => s + n(r.total_cost), 0)))}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{formatPKR(Math.round(rows.reduce((s, r) => s + profit(r), 0)))}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}
