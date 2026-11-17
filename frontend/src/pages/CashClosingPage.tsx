import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import api from '@/services/api';
import { printer } from '@/services/printer';
import { useAuth } from '@/contexts/AuthContext';
import { showToast, showErrorToast } from '@/lib/toast';
import { formatPKR, formatDateTime } from '@/lib/format';
import { encodeCashClosing, type CashClosingSlipData } from '@/lib/escpos';
import { useReceiptSettings } from '@/hooks/useReceiptSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { DatePicker } from '@/components/DatePicker';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { SlipPreview } from '@/components/SlipPreview';
import { LockSimple, Printer, Warning } from '@phosphor-icons/react';

interface Closing {
  id: number;
  expected_cash: number;
  opening_float: number;
  non_cash_amount: number;
  counted_cash: number;
  variance: number;
  note: string | null;
  closed_by: string | null;
  closed_at: string;
}
interface CashierRow {
  user_id: number;
  name: string;
  sales_count: number;
  gross_amount: number;
  voided_count: number;
  voided_amount: number;
  expected_cash: number;
  non_cash_amount: number;
  non_cash: { method: string; label: string; amount: number }[];
  pending_voids: number;
  closing: Closing | null;
  changed_since_close: boolean;
}
interface Report {
  date: string;
  cashiers: CashierRow[];
  totals: {
    sales_count: number;
    voided_amount: number;
    expected_cash: number;
    non_cash_amount: number;
    counted_cash: number;
    variance: number;
    pending_voids: number;
    closed_count: number;
    cashier_count: number;
  };
}

function Variance({ value }: { value: number }) {
  if (value === 0) return <span className="text-green-600 font-medium">Balanced</span>;
  return value < 0
    ? <span className="text-destructive font-semibold">Short {formatPKR(-value)}</span>
    : <span className="text-amber-600 font-semibold">Excess {formatPKR(value)}</span>;
}

export function CashClosingPage() {
  const { user, hasPermission } = useAuth();
  const canClose = hasPermission('cash:close');
  const settings = useReceiptSettings();

  const [date, setDate] = useState(new Date());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const [closingFor, setClosingFor] = useState<CashierRow | null>(null);
  const [counted, setCounted] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [printOpen, setPrintOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const day = format(date, 'yyyy-MM-dd');
  const isFuture = day > format(new Date(), 'yyyy-MM-dd');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Report>('/cash-closing', { params: { date: day } });
      setReport(res.data);
    } catch (err) {
      showErrorToast(err, 'Failed to load cash closing');
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => { load(); }, [load]);

  const countedNum = counted.trim() === '' ? null : Number(counted);
  const countedValid = countedNum !== null && Number.isInteger(countedNum) && countedNum >= 0;
  const floatNum = openingFloat.trim() === '' ? 0 : Number(openingFloat);

  const openClose = (c: CashierRow) => {
    setCounted('');
    setNote('');
    setOpeningFloat('');
    setClosingFor(c);
  };

  const submitClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingFor || !countedValid) return;
    setSaving(true);
    try {
      await api.post('/cash-closing', {
        date: day, user_id: closingFor.user_id, counted_cash: countedNum,
        opening_float: floatNum, note: note || null,
      });
      showToast(`${closingFor.name}'s drawer closed`, 'success');
      setClosingFor(null);
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to close drawer');
    } finally {
      setSaving(false);
    }
  };

  const slipData: CashClosingSlipData | null = useMemo(() => report && {
    date: format(date, 'dd-MMM-yyyy'),
    printed_at: format(new Date(), 'dd-MMM-yyyy hh:mm a'),
    printed_by: user?.name ?? '',
    rows: report.cashiers.map((c) => ({
      name: c.name,
      sales_count: c.sales_count,
      voided_count: c.voided_count,
      voided_amount: c.voided_amount,
      // Print what was actually closed; fall back to live figures for open drawers.
      expected_cash: c.closing?.expected_cash ?? c.expected_cash,
      opening_float: c.closing?.opening_float ?? 0,
      non_cash: c.non_cash.map((m) => ({ label: m.label, amount: m.amount })),
      counted_cash: c.closing?.counted_cash ?? null,
      variance: c.closing?.variance ?? null,
      closed_by: c.closing?.closed_by ?? null,
      note: c.closing?.note ?? null,
    })),
  }, [report, date, user]);

  const slipBytes = useMemo(
    () => (slipData && printOpen ? encodeCashClosing(slipData, { autoCut: printer.autoCut, settings }) : null),
    [slipData, printOpen, settings],
  );

  const printSlip = async () => {
    if (!slipBytes) return;
    setPrinting(true);
    try {
      await printer.printDocument(slipBytes);
      showToast('Closing slip printed', 'success');
      setPrintOpen(false);
    } catch (err) {
      showErrorToast(err, 'Print failed');
    } finally {
      setPrinting(false);
    }
  };

  const totals = report?.totals;

  const status = (c: CashierRow) => c.closing ? (
    <div className="space-y-1">
      <Badge variant="secondary"><LockSimple className="size-3 mr-1" /> Closed</Badge>
      <div className="text-xs text-muted-foreground">by {c.closing.closed_by}, {formatDateTime(c.closing.closed_at)}</div>
      {c.closing.note && <div className="text-xs text-muted-foreground">“{c.closing.note}”</div>}
      {c.changed_since_close && (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <Warning className="size-3.5" /> Voids approved after closing — cash is now {formatPKR(c.expected_cash)}
        </div>
      )}
    </div>
  ) : c.pending_voids > 0 ? (
    <span className="text-xs text-amber-600">{c.pending_voids} pending void(s) — resolve before closing</span>
  ) : canClose && !isFuture ? (
    <Button size="sm" className="w-full md:w-auto" onClick={() => openClose(c)}>Count &amp; close</Button>
  ) : (
    <Badge variant="outline">Open</Badge>
  );
  const previewVariance = closingFor && countedValid ? countedNum! - floatNum - closingFor.expected_cash : null;

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-6">
      <PageHeader
        title="Cash Closing"
        description="Count each cashier's drawer at day end and record any shortage or excess"
        action={report && report.cashiers.length > 0 && (
          <Button variant="outline" onClick={() => setPrintOpen(true)}>
            <Printer className="size-4 mr-1" /> Closing slip
          </Button>
        )}
      />

      <DatePicker value={date} onChange={setDate} />

      {loading || !report || !totals ? <TableSkeleton columns={7} /> : report.cashiers.length === 0 ? (
        <EmptyState title="No sales on this date" description="There is no cash to close." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Cash sales</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPKR(totals.expected_cash)}</div>
                <p className="text-xs text-muted-foreground mt-1">{totals.sales_count} sales{totals.non_cash_amount > 0 && ` · ${formatPKR(totals.non_cash_amount)} card/wallet`}{totals.voided_amount > 0 && ` · ${formatPKR(totals.voided_amount)} voided`}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Counted cash</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatPKR(totals.counted_cash)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Difference</CardTitle></CardHeader>
              <CardContent><div className="text-lg"><Variance value={totals.variance} /></div><p className="text-xs text-muted-foreground mt-1">closed drawers only</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Drawers closed</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.closed_count} / {totals.cashier_count}</div>
                {totals.pending_voids > 0 && <p className="text-xs text-amber-600 mt-1">{totals.pending_voids} void request(s) pending</p>}
              </CardContent>
            </Card>
          </div>

          {/* Phone: one card per drawer */}
          <ul className="md:hidden space-y-2">
            {report.cashiers.map((c) => (
              <li key={c.user_id} className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.sales_count} sales</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Cash sales</dt>
                  <dd className="text-right font-medium tabular-nums">{formatPKR(c.closing?.expected_cash ?? c.expected_cash)}</dd>
                  {c.non_cash_amount > 0 && (<>
                    <dt className="text-muted-foreground">Card / wallet</dt>
                    <dd className="text-right tabular-nums">{formatPKR(c.non_cash_amount)}</dd>
                  </>)}
                  {c.voided_count > 0 && (<>
                    <dt className="text-muted-foreground">Voids ({c.voided_count})</dt>
                    <dd className="text-right tabular-nums">−{formatPKR(c.voided_amount)}</dd>
                  </>)}
                  {c.closing && (<>
                    <dt className="text-muted-foreground">Counted</dt>
                    <dd className="text-right tabular-nums">{formatPKR(c.closing.counted_cash)}</dd>
                    <dt className="text-muted-foreground">Difference</dt>
                    <dd className="text-right"><Variance value={c.closing.variance} /></dd>
                  </>)}
                </dl>
                <div>{status(c)}</div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Voids</TableHead>
                  <TableHead className="text-right">Card / wallet</TableHead>
                  <TableHead className="text-right">Cash expected</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead>Difference</TableHead>
                  <TableHead className="w-56">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.cashiers.map((c) => (
                  <TableRow key={c.user_id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{c.sales_count}</TableCell>
                    <TableCell className="text-right">{c.voided_count > 0 ? `${c.voided_count} · ${formatPKR(c.voided_amount)}` : '—'}</TableCell>
                    <TableCell className="text-right" title={c.non_cash.map((m) => `${m.label}: ${formatPKR(m.amount)}`).join('\n')}>
                      {c.non_cash_amount > 0 ? formatPKR(c.non_cash_amount) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatPKR(c.closing?.expected_cash ?? c.expected_cash)}</TableCell>
                    <TableCell className="text-right">
                      {c.closing ? formatPKR(c.closing.counted_cash) : '—'}
                      {c.closing && c.closing.opening_float > 0 && <div className="text-xs text-muted-foreground">incl. float {formatPKR(c.closing.opening_float)}</div>}
                    </TableCell>
                    <TableCell>{c.closing ? <Variance value={c.closing.variance} /> : '—'}</TableCell>
                    <TableCell>{status(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Day total</TableCell>
                  <TableCell className="text-right">{totals.sales_count}</TableCell>
                  <TableCell className="text-right">{totals.voided_amount > 0 ? formatPKR(totals.voided_amount) : '—'}</TableCell>
                  <TableCell className="text-right">{totals.non_cash_amount > 0 ? formatPKR(totals.non_cash_amount) : '—'}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPKR(totals.expected_cash)}</TableCell>
                  <TableCell className="text-right">{formatPKR(totals.counted_cash)}</TableCell>
                  <TableCell><Variance value={totals.variance} /></TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}

      {/* Count & close */}
      <Dialog open={!!closingFor} onOpenChange={(o) => !o && setClosingFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close drawer — {closingFor?.name}</DialogTitle>
            <DialogDescription>{format(date, 'dd-MMM-yyyy')} · this cannot be changed once saved</DialogDescription>
          </DialogHeader>
          {closingFor && (
            <form onSubmit={submitClose} className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Sales ({closingFor.sales_count})</span><span>{formatPKR(closingFor.gross_amount)}</span></div>
                {closingFor.voided_count > 0 && (
                  <div className="flex justify-between text-muted-foreground"><span>Voids ({closingFor.voided_count})</span><span>−{formatPKR(closingFor.voided_amount)}</span></div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1"><span>Cash sales</span><span>{formatPKR(closingFor.expected_cash)}</span></div>
                {closingFor.non_cash.map((m) => (
                  <div key={m.method} className="flex justify-between text-muted-foreground"><span>{m.label} (not in drawer)</span><span>{formatPKR(m.amount)}</span></div>
                ))}
              </div>
              <FormField label="Opening float — change the drawer started with (PKR)">
                <Input type="text" inputMode="numeric" pattern="[0-9]*" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
              </FormField>
              <div className="flex justify-between text-sm font-semibold"><span>Should be in drawer</span><span>{formatPKR(floatNum + closingFor.expected_cash)}</span></div>
              <FormField label="Cash counted in drawer (PKR)" required>
                <Input type="text" inputMode="numeric" pattern="[0-9]*" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus required />
              </FormField>
              {previewVariance !== null && <div className="text-sm">Result: <Variance value={previewVariance} /></div>}
              <FormField label={previewVariance ? 'Note (explain the difference)' : 'Note (optional)'}>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setClosingFor(null)}>Cancel</Button>
                <Button type="submit" disabled={saving || !countedValid}>
                  {saving && <Spinner className="size-4 mr-2" />} Close drawer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Closing slip */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Closing slip — {format(date, 'dd-MMM-yyyy')}</DialogTitle>
            {totals && totals.closed_count < totals.cashier_count && (
              <DialogDescription className="text-amber-600">
                {totals.cashier_count - totals.closed_count} drawer(s) not closed yet — they print as NOT CLOSED.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-md bg-muted p-3">
            {slipBytes && <SlipPreview bytes={slipBytes} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintOpen(false)}>Close</Button>
            <Button onClick={printSlip} disabled={printing || !printer.isConfigured}>
              {printing ? <Spinner className="size-4 mr-2" /> : <Printer className="size-4 mr-2" />}
              {printer.isConfigured ? 'Print' : 'No printer set up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
