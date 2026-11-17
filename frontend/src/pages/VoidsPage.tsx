import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { showToast, showErrorToast } from '@/lib/toast';
import { formatPKR, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { DatePicker } from '@/components/DatePicker';
import { FormField } from '@/components/FormField';
import { TableSkeleton } from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Prohibit, Check, X } from '@phosphor-icons/react';

interface SaleItem { quantity: number; menu_item: { name: string } | null; }
interface Sale {
  id: number;
  total_amount: number;
  created_at: string;
  voided_at: string | null;
  has_pending_void: boolean;
  user: { id: number; name: string } | null;
  items: SaleItem[];
}
type VoidStatus = 'pending' | 'approved' | 'rejected';
interface VoidRequest {
  id: number;
  sale_id: number;
  reason: string;
  status: VoidStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  requested_by: number;
  requester: { id: number; name: string } | null;
  reviewer: { id: number; name: string } | null;
  sale: Sale | null;
}

const itemsSummary = (items: SaleItem[]) =>
  items.map((i) => `${i.quantity}× ${i.menu_item?.name ?? 'Item'}`).join(', ');

export function VoidsPage() {
  const { user, hasPermission } = useAuth();
  const canRequest = hasPermission('sales:void-request');
  const canApprove = hasPermission('sales:void-approve');

  const [tab, setTab] = useState(canApprove ? 'requests' : 'sales');
  const [statusFilter, setStatusFilter] = useState<VoidStatus | 'all'>(canApprove ? 'pending' : 'all');
  const [date, setDate] = useState(new Date());

  const [sales, setSales] = useState<Sale[]>([]);
  const [requests, setRequests] = useState<VoidRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [requestSale, setRequestSale] = useState<Sale | null>(null);
  const [reason, setReason] = useState('');
  const [review, setReview] = useState<{ request: VoidRequest; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');

  const loadSales = useCallback(async () => {
    const day = format(date, 'yyyy-MM-dd');
    const res = await api.get('/sales', { params: { from: day, to: day, per_page: 100 } });
    setSales(res.data.data);
  }, [date]);

  const loadRequests = useCallback(async () => {
    const res = await api.get('/void-requests', {
      params: { per_page: 100, ...(statusFilter !== 'all' && { status: statusFilter }) },
    });
    setRequests(res.data.data);
  }, [statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await (tab === 'sales' ? loadSales() : loadRequests());
    } catch (err) {
      showErrorToast(err, 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tab, loadSales, loadRequests]);

  useEffect(() => { load(); }, [load]);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestSale) return;
    setSubmitting(true);
    try {
      await api.post(`/sales/${requestSale.id}/void-requests`, { reason });
      showToast(`Void requested for sale #${requestSale.id} — waiting for manager approval`, 'success');
      setRequestSale(null);
      setReason('');
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to request void');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async () => {
    if (!review) return;
    setSubmitting(true);
    try {
      await api.post(`/void-requests/${review.request.id}/${review.action}`, { note: note || null });
      showToast(
        review.action === 'approve'
          ? `Sale #${review.request.sale_id} voided and stock returned`
          : `Void request for sale #${review.request.sale_id} rejected`,
        'success',
      );
      setReview(null);
      setNote('');
      load();
    } catch (err) {
      showErrorToast(err, 'Failed to update request');
    } finally {
      setSubmitting(false);
    }
  };

  const saleStatus = (sale: Sale) => {
    if (sale.voided_at) return <Badge variant="destructive">Voided</Badge>;
    if (sale.has_pending_void) return <Badge variant="outline">Void pending</Badge>;
    return null;
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Voids"
        description={canApprove ? 'Review void requests and request voids for sales' : 'Request a void for a sale — a manager must approve it'}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="requests">Void Requests</TabsTrigger>
          {canRequest && <TabsTrigger value="sales">Sales</TabsTrigger>}
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-wrap gap-1">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
              <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} className="capitalize" onClick={() => setStatusFilter(s)}>
                {s}
              </Button>
            ))}
          </div>

          {loading ? <TableSkeleton columns={6} /> : requests.length === 0 ? (
            <EmptyState
              title={statusFilter === 'pending' ? 'No pending void requests' : 'No void requests'}
              description={canRequest ? 'Request a void from the Sales tab' : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  {canApprove && <TableHead className="w-48">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const isOwn = r.requested_by === user?.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">#{r.sale_id}</div>
                        <div className="text-xs text-muted-foreground max-w-56 truncate">{r.sale ? itemsSummary(r.sale.items) : ''}</div>
                      </TableCell>
                      <TableCell>{r.sale ? formatPKR(r.sale.total_amount) : '—'}</TableCell>
                      <TableCell className="max-w-56">{r.reason}</TableCell>
                      <TableCell>
                        <div>{r.requester?.name}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                        {r.reviewer && (
                          <div className="text-xs text-muted-foreground mt-1">
                            by {r.reviewer.name}{r.review_note ? ` — ${r.review_note}` : ''}
                          </div>
                        )}
                      </TableCell>
                      {canApprove && (
                        <TableCell>
                          {r.status === 'pending' && (isOwn ? (
                            <span className="text-xs text-muted-foreground">Another manager must review</span>
                          ) : (
                            <div className="flex gap-1">
                              <Button size="sm" variant="destructive" onClick={() => { setNote(''); setReview({ request: r, action: 'approve' }); }}>
                                <Check className="size-4 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setNote(''); setReview({ request: r, action: 'reject' }); }}>
                                <X className="size-4 mr-1" /> Reject
                              </Button>
                            </div>
                          ))}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {canRequest && (
          <TabsContent value="sales" className="space-y-4">
            <DatePicker value={date} onChange={setDate} />
            {loading ? <TableSkeleton columns={6} /> : sales.length === 0 ? (
              <EmptyState title="No sales on this date" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="w-40"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => (
                    <TableRow key={s.id} className={s.voided_at ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">#{s.id}</TableCell>
                      <TableCell>{formatDateTime(s.created_at)}</TableCell>
                      <TableCell>{s.user?.name}</TableCell>
                      <TableCell className="max-w-64 truncate">{itemsSummary(s.items)}</TableCell>
                      <TableCell className={s.voided_at ? 'line-through' : ''}>{formatPKR(s.total_amount)}</TableCell>
                      <TableCell>
                        {saleStatus(s) ?? (
                          <Button size="sm" variant="outline" onClick={() => { setReason(''); setRequestSale(s); }}>
                            <Prohibit className="size-4 mr-1" /> Request void
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Request void */}
      <Dialog open={!!requestSale} onOpenChange={(o) => !o && setRequestSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request void — Sale #{requestSale?.id}</DialogTitle>
            <DialogDescription>
              {requestSale && `${formatPKR(requestSale.total_amount)} · ${itemsSummary(requestSale.items)}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRequest} className="space-y-4">
            <FormField label="Reason" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} placeholder="e.g. Wrong item entered, customer cancelled" required autoFocus />
            </FormField>
            <p className="text-xs text-muted-foreground">A manager must approve this before the sale is voided and stock is returned.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestSale(null)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !reason.trim()}>
                {submitting && <Spinner className="size-4 mr-2" />} Submit request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approve / reject */}
      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{review?.action === 'approve' ? 'Approve void' : 'Reject void'} — Sale #{review?.request.sale_id}</DialogTitle>
            <DialogDescription>
              {review?.action === 'approve'
                ? `This removes ${review.request.sale ? formatPKR(review.request.sale.total_amount) : 'the sale'} from sales totals and returns its ingredients to stock. This cannot be undone.`
                : 'The sale stays as it is.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm"><span className="text-muted-foreground">Reason given:</span> {review?.request.reason}</div>
            <FormField label="Note (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
            <Button variant={review?.action === 'approve' ? 'destructive' : 'default'} onClick={submitReview} disabled={submitting}>
              {submitting && <Spinner className="size-4 mr-2" />}
              {review?.action === 'approve' ? 'Approve & void' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
