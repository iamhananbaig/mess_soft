import { format } from 'date-fns';

export function formatPKR(amount: number, { receipt = false } = {}): string {
  return receipt ? `Rs. ${amount.toLocaleString('en-PK')}` : `Rs.${amount.toLocaleString('en-PK')}`;
}

export function parseLocal(date: Date | string): Date {
  if (date instanceof Date) return new Date(date);

  if (typeof date === 'string') {
    // ISO timestamps with explicit timezone (Z or ±HH:MM) — let JS handle conversion
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(date)) {
      return new Date(date);
    }

    // Timezone-less strings (e.g. "2026-08-17 10:30:00") — interpret as local time
    const parts = date.split(/[- T:]/);
    if (parts.length >= 3) {
      return new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
        Number(parts[3] || 0),
        Number(parts[4] || 0),
      );
    }
  }

  return new Date(date);
}

export function formatDate(date: Date | string): string {
  return format(parseLocal(date), 'dd-MMM-yy');
}

export function formatDateTime(date: Date | string): string {
  return format(parseLocal(date), 'dd-MMM-yy hh:mm a');
}
