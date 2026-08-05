import { useState, useEffect } from 'react';
import api from '@/services/api';
import { showToast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { DatePicker } from '@/components/DatePicker';
import { Badge } from '@/components/ui/badge';
import { formatPKR, formatDate, formatDateTime } from '@/lib/format';
import { format } from 'date-fns';
import { ArrowClockwise, TrendUp, Receipt, Package, Warning, List, StackSimple, ChartBar, Book } from '@phosphor-icons/react';

interface ReceiptItem {
  item: string;
  price: number;
  quantity: number;
  amount: number;
}

interface ReceiptData {
  id: number;
  created_at: string;
  payment_method: string;
  total_amount: number;
  items: ReceiptItem[];
}

interface StockSummaryItem {
  id: number;
  name: string;
  unit: string;
  opening: number;
  additions: number;
  pos_consumption: number;
  manual_consumption: number;
  expired: number;
  adjustments: number;
  closing: number;
}

interface LedgerMovement {
  id: number;
  date: string;
  type: string;
  source: string;
  source_label: string;
  quantity: number;
  balance: number;
  reference: string | null;
  note: string | null;
  user: string;
}

interface LedgerData {
  item: { id: number; name: string; unit: string };
  opening_stock: number;
  closing_stock: number;
  movements: LedgerMovement[];
}

interface InventoryItem {
  id: number;
  name: string;
  unit: string;
}

export function ReportsPage() {
  const [tab, setTab] = useState('daily');
  const [dailyView, setDailyView] = useState<'items' | 'receipts'>('items');
  const [date, setDate] = useState<Date>(new Date());
  const [fromDate, setFromDate] = useState<Date>(() => { const d = new Date(); d.setDate(1); return d; });
  const [toDate, setToDate] = useState<Date>(new Date());
  const [daily, setDaily] = useState({ total_sales: 0, total_transactions: 0, items_sold: 0, items: [] as { menu_item: { name: string }; total_quantity: number; total_revenue: number }[] });
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [groupReceipts, setGroupReceipts] = useState(true);
  const [items, setItems] = useState<{ menu_item: { name: string }; total_quantity: number; total_revenue: number }[]>([]);
  const [stock, setStock] = useState<{ name: string; unit: string; current_stock: number }[]>([]);
  const [waste, setWaste] = useState({ expired: [], manual: [] });
  const [stockSummary, setStockSummary] = useState<StockSummaryItem[]>([]);
  const [ledgerItems, setLedgerItems] = useState<InventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);

  const dateStr = format(date, 'yyyy-MM-dd');
  const fromStr = format(fromDate, 'yyyy-MM-dd');
  const toStr = format(toDate, 'yyyy-MM-dd');

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'daily') {
        const [dailyRes, receiptsRes] = await Promise.all([
          api.get(`/reports/daily?date=${dateStr}`),
          api.get(`/reports/receipts?date=${dateStr}`),
        ]);
        setDaily(dailyRes.data);
        setReceipts(receiptsRes.data.receipts ?? []);
      }
      else if (tab === 'items') { const r = await api.get('/reports/items'); setItems(r.data.data ?? r.data); }
      else if (tab === 'stock') { const r = await api.get('/reports/stock'); setStock(r.data); }
      else if (tab === 'waste') { const r = await api.get('/reports/waste'); setWaste(r.data); }
      else if (tab === 'stock-summary') {
        const r = await api.get(`/reports/stock-summary?from=${fromStr}&to=${toStr}`);
        setStockSummary(r.data);
      }
      else if (tab === 'ledger' && selectedItemId) {
        const r = await api.get(`/reports/ledger?inventory_item_id=${selectedItemId}&from=${fromStr}&to=${toStr}`);
        setLedger(r.data);
      }
    } catch {
      showToast('Failed to load report data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'ledger' && ledgerItems.length === 0) {
      api.get('/inventory').then((r) => {
        const items = r.data;
        setLedgerItems(items);
        if (items.length > 0 && !selectedItemId) {
          setSelectedItemId(String(items[0].id));
        }
      }).catch(() => {
        showToast('Failed to load inventory items', 'error');
      });
    }
  }, [tab, ledgerItems.length, selectedItemId]);

  useEffect(() => { load(); }, [tab, date, fromDate, toDate, selectedItemId]);

  const flatReceiptItems = receipts.flatMap((r) =>
    r.items.map((item) => ({
      receipt_id: r.id,
      created_at: r.created_at,
      payment_method: r.payment_method,
      receipt_total: r.total_amount,
      ...item,
    }))
  );

  const dateControls = (
    <div className="flex items-center gap-3">
      <DatePicker value={fromDate} onChange={setFromDate} />
      <span className="text-muted-foreground text-sm">to</span>
      <DatePicker value={toDate} onChange={setToDate} />
      <Button variant="outline" size="sm" onClick={load} disabled={loading}>
        <ArrowClockwise className={`size-4 ${loading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Reports" description="View sales, inventory, and waste analytics" />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="daily">
              <TrendUp className="size-4 mr-1.5" /> Daily
            </TabsTrigger>
            <TabsTrigger value="items">
              <Receipt className="size-4 mr-1.5" /> Top Items
            </TabsTrigger>
            <TabsTrigger value="stock-summary">
              <ChartBar className="size-4 mr-1.5" /> Stock Summary
            </TabsTrigger>
            <TabsTrigger value="ledger">
              <Book className="size-4 mr-1.5" /> Ledger
            </TabsTrigger>
            <TabsTrigger value="stock">
              <Package className="size-4 mr-1.5" /> Stock Value
            </TabsTrigger>
            <TabsTrigger value="waste">
              <Warning className="size-4 mr-1.5" /> Waste
            </TabsTrigger>
          </TabsList>

          {tab === 'daily' && (
            <div className="flex items-center gap-3">
              <DatePicker value={date} onChange={setDate} />
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <ArrowClockwise className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          )}
          {(tab === 'stock-summary' || tab === 'ledger') && dateControls}
        </div>

        {/* === DAILY TAB === */}
        <TabsContent value="daily">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}><CardHeader><div className="h-4 w-24 bg-muted rounded animate-pulse" /></CardHeader><CardContent><div className="h-8 w-32 bg-muted rounded animate-pulse" /></CardContent></Card>
                ))}
              </div>
              <TableSkeleton columns={3} />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
                    <TrendUp className="size-4 text-accent" />
                  </CardHeader>
                  <CardContent><div className="text-2xl font-bold">{formatPKR(daily.total_sales)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
                    <Receipt className="size-4 text-accent" />
                  </CardHeader>
                  <CardContent><div className="text-2xl font-bold">{daily.total_transactions}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Items Sold</CardTitle>
                    <Package className="size-4 text-accent" />
                  </CardHeader>
                  <CardContent><div className="text-2xl font-bold">{daily.items_sold}</div></CardContent>
                </Card>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                  <button onClick={() => setDailyView('items')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${dailyView === 'items' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <List className="size-3.5" /> Items
                  </button>
                  <button onClick={() => setDailyView('receipts')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${dailyView === 'receipts' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Receipt className="size-3.5" /> Receipts
                  </button>
                </div>
                {dailyView === 'receipts' && (
                  <Button variant={groupReceipts ? 'default' : 'outline'} size="sm" onClick={() => setGroupReceipts(!groupReceipts)}>
                    <StackSimple className="size-3.5 mr-1.5" />
                    {groupReceipts ? 'Grouped' : 'Flat'}
                  </Button>
                )}
              </div>

              {dailyView === 'items' ? (
                daily.items.length === 0 ? (
                  <EmptyState title="No items sold on this date" />
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty Sold</TableHead><TableHead>Revenue</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {daily.items.map((i, idx) => (
                        <TableRow key={idx}><TableCell className="font-medium">{i.menu_item?.name}</TableCell><TableCell>{i.total_quantity}</TableCell><TableCell>{formatPKR(i.total_revenue)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : (
                flatReceiptItems.length === 0 ? (
                  <EmptyState title="No receipts on this date" />
                ) : groupReceipts ? (
                  <div className="space-y-4">
                    {receipts.map((r) => (
                      <div key={r.id} className="rounded-lg border">
                        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold">#{r.id}</span>
                            <span className="text-sm text-muted-foreground">{formatDateTime(r.created_at)}</span>
                            <span className="text-xs text-muted-foreground capitalize">{r.payment_method}</span>
                          </div>
                          <span className="text-sm font-semibold">{formatPKR(r.total_amount)}</span>
                        </div>
                        <Table>
                          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {r.items.map((item, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{item.item}</TableCell>
                                <TableCell className="text-right">{formatPKR(item.price)}</TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">{formatPKR(item.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Date & Time</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {flatReceiptItems.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">#{r.receipt_id}</TableCell>
                          <TableCell>{formatDateTime(r.created_at)}</TableCell>
                          <TableCell>{r.item}</TableCell>
                          <TableCell className="text-right">{formatPKR(r.price)}</TableCell>
                          <TableCell className="text-right">{r.quantity}</TableCell>
                          <TableCell className="text-right">{formatPKR(r.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              )}
            </div>
          )}
        </TabsContent>

        {/* === TOP ITEMS TAB === */}
        <TabsContent value="items">
          {loading ? <TableSkeleton columns={3} /> : items.length === 0 ? (
            <EmptyState title="No sales data available" description="Sales will appear here once transactions are recorded" />
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty Sold</TableHead><TableHead>Revenue</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((i, idx) => (
                  <TableRow key={idx}><TableCell className="font-medium">{i.menu_item?.name}</TableCell><TableCell>{i.total_quantity}</TableCell><TableCell>{formatPKR(i.total_revenue)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* === STOCK SUMMARY TAB === */}
        <TabsContent value="stock-summary">
          {loading ? <TableSkeleton columns={9} /> : stockSummary.length === 0 ? (
            <EmptyState title="No stock data available" description="Stock summary will appear here once inventory items exist" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">Item</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right text-green-600">+ Additions</TableHead>
                    <TableHead className="text-right text-red-600">- POS</TableHead>
                    <TableHead className="text-right text-red-600">- Manual</TableHead>
                    <TableHead className="text-right text-red-600">- Expired</TableHead>
                    <TableHead className="text-right text-amber-600">± Adjust</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockSummary.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium sticky left-0 bg-background">{item.name}</TableCell>
                      <TableCell><Badge variant="outline">{item.unit}</Badge></TableCell>
                      <TableCell className="text-right">{item.opening}</TableCell>
                      <TableCell className="text-right text-green-600">{item.additions > 0 ? `+${item.additions}` : '—'}</TableCell>
                      <TableCell className="text-right text-red-600">{item.pos_consumption < 0 ? item.pos_consumption : '—'}</TableCell>
                      <TableCell className="text-right text-red-600">{item.manual_consumption < 0 ? item.manual_consumption : '—'}</TableCell>
                      <TableCell className="text-right text-red-600">{item.expired < 0 ? item.expired : '—'}</TableCell>
                      <TableCell className={`text-right ${item.adjustments >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                        {item.adjustments !== 0 ? (item.adjustments > 0 ? `+${item.adjustments}` : item.adjustments) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{item.closing}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* === LEDGER TAB === */}
        <TabsContent value="ledger">
          <div className="flex items-center gap-3 mb-4">
            <Select value={selectedItemId} onValueChange={setSelectedItemId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select item">{ledgerItems.find((i) => String(i.id) === selectedItemId)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ledgerItems.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? <TableSkeleton columns={7} /> : !ledger ? (
            <EmptyState title="Select an item to view its ledger" description="Choose an inventory item from the dropdown above" />
          ) : ledger.movements.length === 0 ? (
            <EmptyState title="No movements in this period" description="Stock movements will appear here once transactions are recorded" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-6 text-sm">
                <span className="text-muted-foreground">Item: <strong className="text-foreground">{ledger.item.name}</strong></span>
                <span className="text-muted-foreground">Unit: <strong className="text-foreground">{ledger.item.unit}</strong></span>
                <span className="text-muted-foreground">Opening: <strong className="text-foreground">{ledger.opening_stock}</strong></span>
                <span className="text-muted-foreground">Closing: <strong className="text-foreground">{ledger.closing_stock}</strong></span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={4}>Opening Balance</TableCell>
                    <TableCell className="text-right">{ledger.opening_stock}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                  {ledger.movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{m.date}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{m.source_label}</Badge></TableCell>
                      <TableCell className="text-right text-green-600">{m.quantity > 0 ? m.quantity : '—'}</TableCell>
                      <TableCell className="text-right text-red-600">{m.quantity < 0 ? Math.abs(m.quantity) : '—'}</TableCell>
                      <TableCell className="text-right font-medium">{m.balance}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.reference ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-48 truncate">{m.note ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={4}>Closing Balance</TableCell>
                    <TableCell className="text-right">{ledger.closing_stock}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* === STOCK VALUE TAB === */}
        <TabsContent value="stock">
          {loading ? <TableSkeleton columns={3} /> : stock.length === 0 ? (
            <EmptyState title="No stock data available" description="Stock values will appear here once inventory is added" />
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Unit</TableHead><TableHead>Stock</TableHead></TableRow></TableHeader>
              <TableBody>
                {stock.map((s, idx) => (
                  <TableRow key={idx}><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.unit}</TableCell><TableCell>{s.current_stock}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* === WASTE TAB === */}
        <TabsContent value="waste">
          {loading ? <TableSkeleton columns={3} /> : (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Expired</h3>
                {(waste.expired as { date: string; item: string; quantity: number }[]).length === 0 ? (
                  <EmptyState title="No expired records" />
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(waste.expired as { date: string; item: string; quantity: number }[]).map((e, idx) => (
                        <TableRow key={idx}><TableCell>{formatDate(e.date)}</TableCell><TableCell className="font-medium">{e.item}</TableCell><TableCell>{e.quantity}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div>
                <h3 className="font-semibold mb-3">Manual Consumption</h3>
                {(waste.manual as { date: string; item: string; quantity: number; reason: string }[]).length === 0 ? (
                  <EmptyState title="No manual consumption records" />
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(waste.manual as { date: string; item: string; quantity: number; reason: string }[]).map((m, idx) => (
                        <TableRow key={idx}><TableCell>{formatDate(m.date)}</TableCell><TableCell className="font-medium">{m.item}</TableCell><TableCell>{m.quantity}</TableCell><TableCell>{m.reason}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
