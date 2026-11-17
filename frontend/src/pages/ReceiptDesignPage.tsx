import { useEffect, useMemo, useState } from 'react';
import api from '@/services/api';
import { printer } from '@/services/printer';
import { useAuth } from '@/contexts/AuthContext';
import { showToast, showErrorToast } from '@/lib/toast';
import { encodeReceiptCopies, type ReceiptSettings } from '@/lib/escpos';
import { fetchReceiptSettings, setReceiptSettingsCache } from '@/hooks/useReceiptSettings';
import type { ReceiptCopy, ReceiptData } from '@/types/receipt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { FormField } from '@/components/FormField';
import { PageSpinner } from '@/components/PageSpinner';
import { SlipPreview } from '@/components/SlipPreview';
import { Printer } from '@phosphor-icons/react';

const SAMPLE: ReceiptData = {
  canteen_name: '',
  branch_name: '',
  date: '17-Nov-2026',
  time: '01:45 PM',
  receipt_number: '000123',
  cashier: 'Cashier 1',
  items: [
    { name: 'Chicken Burger', quantity: 2, rate: 350, amount: 700 },
    { name: 'Coke 500ml', quantity: 2, rate: 60, amount: 120 },
    { name: 'French Fries', quantity: 1, rate: 150, amount: 150 },
  ],
  total: 970,
  payment_method: 'Cash',
  amount_received: 1000,
  change: 30,
};

type PreviewCopies = 'both' | ReceiptCopy;

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function ReceiptDesignPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('settings:manage');

  const [saved, setSaved] = useState<ReceiptSettings | null>(null);
  const [form, setForm] = useState<ReceiptSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  const [previewCopies, setPreviewCopies] = useState<PreviewCopies>('customer');
  const [asReprint, setAsReprint] = useState(false);
  const [asVoided, setAsVoided] = useState(false);

  useEffect(() => {
    fetchReceiptSettings(true)
      .then((s) => { setSaved(s); setForm(s); })
      .catch((err) => showErrorToast(err, 'Failed to load receipt settings'));
  }, []);

  const copies: ReceiptCopy[] = previewCopies === 'both' ? ['customer', 'accounts'] : [previewCopies];
  const sample = useMemo(() => ({ ...SAMPLE, voided: asVoided }), [asVoided]);
  const bytes = useMemo(
    () => (form ? encodeReceiptCopies(sample, copies, { settings: form, reprint: asReprint, autoCut: printer.autoCut }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, sample, previewCopies, asReprint],
  );

  if (!form || !saved) return <PageSpinner />;

  const set = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => setForm({ ...form, [key]: value });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const headerLineCount = form.header_lines.split(/\r?\n/).length;

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put<ReceiptSettings>('/settings/receipt', form);
      setSaved(res.data);
      setForm(res.data);
      setReceiptSettingsCache(res.data);
      showToast('Receipt design saved — all tills will use it', 'success');
    } catch (err) {
      showErrorToast(err, 'Failed to save receipt design');
    } finally {
      setSaving(false);
    }
  };

  const testPrint = async () => {
    setTestPrinting(true);
    try {
      await printer.printReceipt(sample, { copies, reprint: asReprint, settings: form });
      showToast('Test slip printed', 'success');
    } catch (err) {
      showErrorToast(err, 'Test print failed');
    } finally {
      setTestPrinting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Receipt Design"
        description="Customize the printed slip. The preview shows exactly what the printer receives."
        action={canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setForm(saved)} disabled={!dirty || saving}>Discard</Button>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground" onClick={save} disabled={!dirty || saving}>
              {saving && <Spinner className="size-4 mr-2" />} Save
            </Button>
          </div>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <fieldset disabled={!canEdit} className="space-y-6 min-w-0">
          <Card>
            <CardHeader><CardTitle className="text-base">Header</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Canteen name" required>
                <Input value={form.canteen_name} maxLength={60} onChange={(e) => set('canteen_name', e.target.value)} />
              </FormField>
              <Toggle label="Show branch name" checked={form.show_branch} onChange={(v) => set('show_branch', v)} />
              {form.show_branch && (
                <FormField label="Branch name">
                  <Input value={form.branch_name} maxLength={60} onChange={(e) => set('branch_name', e.target.value)} />
                </FormField>
              )}
              <FormField label="Extra header lines (address, phone, NTN — up to 3 lines)">
                <Textarea
                  rows={3}
                  value={form.header_lines}
                  maxLength={200}
                  placeholder={'Blue Area, Islamabad\nPh: 051-1234567'}
                  onChange={(e) => set('header_lines', e.target.value)}
                />
                {headerLineCount > 3 && <p className="text-xs text-destructive">Only the first 3 lines will print.</p>}
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Body &amp; footer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Toggle label="Show cashier name" checked={form.show_cashier} onChange={(v) => set('show_cashier', v)} />
              <Toggle label="Show paid / change" checked={form.show_payment} onChange={(v) => set('show_payment', v)} />
              <FormField label="Footer message (leave empty to hide)">
                <Input value={form.footer_text} maxLength={120} onChange={(e) => set('footer_text', e.target.value)} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Paper</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Paper width">
                <div className="flex gap-1">
                  {(['58', '80'] as const).map((w) => (
                    <Button key={w} type="button" size="sm" variant={form.paper_width === w ? 'default' : 'outline'} onClick={() => set('paper_width', w)}>
                      {w} mm
                    </Button>
                  ))}
                </div>
              </FormField>
              <FormField label="Blank lines after the tear line (no-cutter printers)">
                <Input
                  type="number"
                  min={0}
                  max={12}
                  className="w-24"
                  value={form.tear_feed_lines}
                  onChange={(e) => set('tear_feed_lines', Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
                />
                <p className="text-xs text-muted-foreground">Increase if the TEAR HERE line stays inside the printer; decrease if there is too much blank paper.</p>
              </FormField>
            </CardContent>
          </Card>
          {!canEdit && <p className="text-sm text-muted-foreground">You can view the design, but only an admin can change it.</p>}
        </fieldset>

        {/* Live preview */}
        <div className="flex flex-col gap-3 lg:self-start">
          <div className="flex flex-wrap items-center gap-1">
            {(['customer', 'accounts', 'both'] as const).map((c) => (
              <Button key={c} type="button" size="sm" variant={previewCopies === c ? 'default' : 'outline'} className="h-7 text-xs capitalize" onClick={() => setPreviewCopies(c)}>
                {c === 'both' ? 'Both copies' : c}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2"><Switch size="sm" checked={asReprint} onCheckedChange={setAsReprint} /> Reprint</label>
            <label className="flex items-center gap-2"><Switch size="sm" checked={asVoided} onCheckedChange={setAsVoided} /> Voided sale</label>
          </div>
          {/* Full-length slip; the page scrolls rather than a fixed-height box. */}
          <div className="overflow-x-auto rounded-lg bg-muted p-4">
            {bytes && <SlipPreview bytes={bytes} />}
          </div>
          <Button variant="outline" onClick={testPrint} disabled={testPrinting || !printer.isConfigured}>
            {testPrinting ? <Spinner className="size-4 mr-2" /> : <Printer className="size-4 mr-2" />}
            {printer.isConfigured ? 'Print test slip' : 'Connect a printer (from a sale) to test print'}
          </Button>
          <p className="text-xs text-muted-foreground max-w-xs">
            Test prints use the unsaved design. Cut/tear follows this till's “auto-cutter” setting in the print dialog.
          </p>
        </div>
      </div>
    </div>
  );
}
