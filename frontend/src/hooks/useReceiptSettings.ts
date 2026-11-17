import { useEffect, useState } from 'react';
import api from '@/services/api';
import { DEFAULT_RECEIPT_SETTINGS, type ReceiptSettings } from '@/lib/escpos';

// Shared across components so the print dialog doesn't refetch on every sale.
let cache: ReceiptSettings | null = null;
let inflight: Promise<ReceiptSettings> | null = null;
const listeners = new Set<(s: ReceiptSettings) => void>();

export function fetchReceiptSettings(force = false): Promise<ReceiptSettings> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = api
    .get<ReceiptSettings>('/settings/receipt')
    .then((res) => setReceiptSettingsCache({ ...DEFAULT_RECEIPT_SETTINGS, ...res.data }))
    .finally(() => { inflight = null; });
  return inflight;
}

export function setReceiptSettingsCache(settings: ReceiptSettings): ReceiptSettings {
  cache = settings;
  listeners.forEach((l) => l(settings));
  return settings;
}

/** Current receipt layout. Falls back to defaults until loaded (or if the request fails). */
export function useReceiptSettings(): ReceiptSettings {
  const [settings, setSettings] = useState<ReceiptSettings>(cache ?? DEFAULT_RECEIPT_SETTINGS);

  useEffect(() => {
    listeners.add(setSettings);
    fetchReceiptSettings().catch(() => {});
    return () => { listeners.delete(setSettings); };
  }, []);

  return settings;
}
