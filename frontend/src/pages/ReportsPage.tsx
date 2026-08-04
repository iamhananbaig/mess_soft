import { useState, useEffect } from 'react';
import api from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPKR } from '@/lib/format';
import { ArrowClockwise } from '@phosphor-icons/react';

export function ReportsPage() {
  const [tab, setTab] = useState('daily');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [daily, setDaily] = useState({ total_sales: 0, total_transactions: 0, items_sold: 0 });
  const [items, setItems] = useState<{ menu_item: { name: string }; total_quantity: number; total_revenue: number }[]>([]);
  const [stock, setStock] = useState<{ name: string; unit: string; current_stock: number; total_value: number }[]>([]);
  const [waste, setWaste] = useState({ expired: [], manual: [] });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    if (tab === 'daily') { const r = await api.get(`/reports/daily?date=${date}`); setDaily(r.data); }
    else if (tab === 'items') { const r = await api.get('/reports/items'); setItems(r.data.data ?? r.data); }
    else if (tab === 'stock') { const r = await api.get('/reports/stock'); setStock(r.data); }
    else if (tab === 'waste') { const r = await api.get('/reports/waste'); setWaste(r.data); }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tab, date]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="daily">Daily Summary</TabsTrigger>
          <TabsTrigger value="items">Top Items</TabsTrigger>
          <TabsTrigger value="stock">Stock Value</TabsTrigger>
          <TabsTrigger value="waste">Waste</TabsTrigger>
        </TabsList>

        <div className="mb-4 flex items-end gap-4">
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <ArrowClockwise className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <TabsContent value="daily">
          {loading ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardHeader><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-32" /></CardContent></Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total Sales</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatPKR(daily.total_sales)}</CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Transactions</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{daily.total_transactions}</CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Items Sold</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{daily.items_sold}</CardContent></Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="items">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 p-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-20" /></div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty Sold</TableHead><TableHead>Revenue</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No sales data available</TableCell></TableRow>
                ) : items.map((i, idx) => (
                  <TableRow key={idx}><TableCell className="font-medium">{i.menu_item?.name}</TableCell><TableCell>{i.total_quantity}</TableCell><TableCell>{formatPKR(i.total_revenue)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="stock">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 p-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-20" /></div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Unit</TableHead><TableHead>Stock</TableHead><TableHead>Value</TableHead></TableRow></TableHeader>
              <TableBody>
                {stock.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No stock data available</TableCell></TableRow>
                ) : stock.map((s, idx) => (
                  <TableRow key={idx}><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.unit}</TableCell><TableCell>{s.current_stock}</TableCell><TableCell>{formatPKR(s.total_value)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="waste">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 p-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-16" /></div>
              ))}
            </div>
          ) : (
            <>
              <h3 className="font-semibold mb-2">Expired</h3>
              <Table className="mb-6">
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(waste.expired as { date: string; item: string; quantity: number }[]).length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No expired records</TableCell></TableRow>
                  ) : (waste.expired as { date: string; item: string; quantity: number }[]).map((e, idx) => (
                    <TableRow key={idx}><TableCell>{e.date}</TableCell><TableCell className="font-medium">{e.item}</TableCell><TableCell>{e.quantity}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
              <h3 className="font-semibold mb-2">Manual Consumption</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(waste.manual as { date: string; item: string; quantity: number; reason: string }[]).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No manual consumption records</TableCell></TableRow>
                  ) : (waste.manual as { date: string; item: string; quantity: number; reason: string }[]).map((m, idx) => (
                    <TableRow key={idx}><TableCell>{m.date}</TableCell><TableCell className="font-medium">{m.item}</TableCell><TableCell>{m.quantity}</TableCell><TableCell>{m.reason}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
