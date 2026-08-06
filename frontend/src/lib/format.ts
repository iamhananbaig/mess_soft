import { format } from 'date-fns';

export function formatPKR(amount: number, { receipt = false } = {}): string {
  return receipt ? `Rs. ${amount.toLocaleString('en-PK')}` : `Rs.${amount.toLocaleString('en-PK')}`;
}

function parseLocal(date: Date | string): Date {
  if (typeof date === 'string') {
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
