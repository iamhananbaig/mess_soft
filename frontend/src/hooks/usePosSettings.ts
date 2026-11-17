import { useEffect, useState } from 'react';
import api from '@/services/api';

export interface PaymentMethodOption { key: string; label: string; }
export interface PosSettings {
  payment_methods: string[];
  available_payment_methods: PaymentMethodOption[];
}

const FALLBACK: PosSettings = { payment_methods: ['cash'], available_payment_methods: [{ key: 'cash', label: 'Cash' }] };

let cache: PosSettings | null = null;
const listeners = new Set<(s: PosSettings) => void>();

export function setPosSettingsCache(s: PosSettings) {
  cache = s;
  listeners.forEach((l) => l(s));
}

/** Enabled payment methods etc. Cash-only until loaded (or if the request fails). */
export function usePosSettings(): PosSettings {
  const [settings, setSettings] = useState<PosSettings>(cache ?? FALLBACK);
  useEffect(() => {
    listeners.add(setSettings);
    if (!cache) api.get<PosSettings>('/settings/pos').then((r) => setPosSettingsCache(r.data)).catch(() => {});
    return () => { listeners.delete(setSettings); };
  }, []);
  return settings;
}
