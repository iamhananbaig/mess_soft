import { useEffect, useState } from 'react';
import api from '@/services/api';
import { showToast, showErrorToast } from '@/lib/toast';
import { setPosSettingsCache, type PosSettings } from '@/hooks/usePosSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** Which payment methods the POS offers. Cash can't be turned off. */
export function PaymentMethodsCard({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<PosSettings | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<PosSettings>('/settings/pos').then((r) => { setSettings(r.data); setEnabled(r.data.payment_methods); })
      .catch((err) => showErrorToast(err, 'Failed to load payment settings'));
  }, []);

  if (!settings) return null;
  const dirty = [...enabled].sort().join() !== [...settings.payment_methods].sort().join();

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put<PosSettings>('/settings/pos', { payment_methods: enabled });
      setSettings(r.data);
      setEnabled(r.data.payment_methods);
      setPosSettingsCache(r.data);
      showToast('Payment methods saved', 'success');
    } catch (err) {
      showErrorToast(err, 'Failed to save payment methods');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment methods</CardTitle>
        <CardDescription>Shown as buttons at checkout. Card and wallet sales are kept out of the cash drawer count.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.available_payment_methods.map((m) => (
          <label key={m.key} className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm font-medium">{m.label}{m.key === 'cash' && <span className="text-xs text-muted-foreground font-normal"> — always on</span>}</span>
            <Switch
              checked={enabled.includes(m.key)}
              disabled={!canEdit || m.key === 'cash'}
              onCheckedChange={(on) => setEnabled((prev) => on ? [...prev, m.key] : prev.filter((k) => k !== m.key))}
            />
          </label>
        ))}
        {canEdit && (
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving && <Spinner className="size-4 mr-2" />} Save payment methods
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
