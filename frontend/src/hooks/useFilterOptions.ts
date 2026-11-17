import { useEffect, useState } from 'react';
import api from '@/services/api';
import type { Category } from '@/types/api';
import type { Option } from '@/components/ReportFilters';

/** Options for cashier / category / payment-method filters, loaded once. */
export function useFilterOptions() {
  const [cashiers, setCashiers] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [methods, setMethods] = useState<Option[]>([]);

  useEffect(() => {
    api.get<{ id: number; name: string }[]>('/reports/cashiers')
      .then((r) => setCashiers(r.data.map((u) => ({ value: String(u.id), label: u.name })))).catch(() => {});
    api.get<Category[]>('/categories')
      .then((r) => setCategories(r.data.map((c) => ({ value: String(c.id), label: c.name })))).catch(() => {});
    api.get<{ available_payment_methods: { key: string; label: string }[] }>('/settings/pos')
      .then((r) => setMethods(r.data.available_payment_methods.map((m) => ({ value: m.key, label: m.label })))).catch(() => {});
  }, []);

  return { cashiers, categories, methods };
}
