import type { ReceiptData } from '@/components/Receipt';

const TEXT_ENCODER = new TextEncoder();

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function text(str: string): Uint8Array {
  return TEXT_ENCODER.encode(str);
}

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

export function initialize(): Uint8Array {
  return bytes(0x1b, 0x40); // ESC @
}

export function align(mode: 'left' | 'center' | 'right'): Uint8Array {
  const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
  return bytes(0x1b, 0x61, n); // ESC a n
}

export function bold(on: boolean): Uint8Array {
  return bytes(0x1b, 0x45, on ? 1 : 0); // ESC E n
}

export function doubleWidth(on: boolean): Uint8Array {
  return bytes(0x1d, 0x21, on ? 0x10 : 0x00); // GS ! n (double width)
}

export function doubleSize(on: boolean): Uint8Array {
  return bytes(0x1d, 0x21, on ? 0x11 : 0x00); // GS ! n (double width + height)
}

export function newline(): Uint8Array {
  return bytes(0x0a); // LF
}

export function feedLines(n: number): Uint8Array {
  return bytes(0x1b, 0x64, n); // ESC d n
}

export function cut(type: 'full' | 'partial' = 'full'): Uint8Array {
  return bytes(0x1d, 0x56, type === 'full' ? 0 : 1); // GS V m
}

function padRight(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

function padLeft(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return ' '.repeat(width - str.length) + str;
}

const LINE_WIDTH = 48; // 80mm thermal printer ~ 48 chars

function line(char = '─'): string {
  return char.repeat(LINE_WIDTH);
}

export function encodeReceipt(data: ReceiptData): Uint8Array {
  const parts: Uint8Array[] = [];
  const isCash = data.payment_method === 'Cash';
  const W = LINE_WIDTH;

  parts.push(initialize());

  // Header
  parts.push(align('center'));
  parts.push(bold(true));
  parts.push(doubleWidth(true));
  parts.push(text(data.canteen_name));
  parts.push(newline());
  parts.push(doubleWidth(false));
  parts.push(bold(false));
  parts.push(text(data.branch_name));
  parts.push(newline());
  parts.push(text(line('═')));
  parts.push(newline());

  // Info section
  parts.push(align('left'));
  parts.push(
    text(
      padRight(`Date: ${data.date}`, W / 2) +
        padLeft(`Time: ${data.time}`, W / 2) +
        '\n'
    )
  );
  parts.push(
    text(
      padRight(`Receipt #: ${data.receipt_number}`, W / 2) +
        padLeft(data.receipt_number ? 'ORIGINAL' : '', W / 2) +
        '\n'
    )
  );
  parts.push(text(`Cashier: ${data.cashier}\n`));

  // Separator
  parts.push(text(line('─') + '\n'));

  // Column header
  parts.push(
    text(
      padRight('Item', 20) +
        padLeft('Qty', 5) +
        padLeft('Rate', 10) +
        padLeft('Amount', 13) +
        '\n'
    )
  );

  // Items
  for (const item of data.items) {
    const name = item.name.length > 20 ? item.name.slice(0, 17) + '...' : item.name;
    parts.push(
      text(
        padRight(name, 20) +
          padLeft(String(item.quantity), 5) +
          padLeft(String(item.rate), 10) +
          padLeft(String(item.amount), 13) +
          '\n'
      )
    );
  }

  // Separator
  parts.push(text(line('─') + '\n'));

  // Total
  parts.push(text(line('═') + '\n'));
  parts.push(align('left'));
  parts.push(bold(true));
  parts.push(
    text(
      padRight('TOTAL', W - 14) +
        padLeft(`Rs.${data.total.toLocaleString('en-PK')}`, 14) +
        '\n'
    )
  );
  parts.push(bold(false));
  parts.push(text(line('═') + '\n'));

  // Payment info
  parts.push(text(`\nPayment: ${data.payment_method}\n`));
  if (isCash && data.amount_received !== null) {
    parts.push(
      text(
        padRight('Received:', 34) +
          padLeft(`Rs.${data.amount_received.toLocaleString('en-PK')}`, 14) +
          '\n'
      )
    );
    parts.push(
      text(
        padRight('Change:', 34) +
          padLeft(`Rs.${(data.change ?? 0).toLocaleString('en-PK')}`, 14) +
          '\n'
      )
    );
  }

  // Footer
  parts.push(feedLines(2));
  parts.push(align('center'));
  parts.push(text(`Operator: ${data.cashier}\n`));
  parts.push(feedLines(1));
  parts.push(bold(true));
  parts.push(text('Thank you for visiting IDC!\n'));
  parts.push(bold(false));
  parts.push(text('Computer-generated receipt\n'));
  parts.push(text(line('═') + '\n'));

  // Cut
  parts.push(feedLines(3));
  parts.push(cut('partial'));

  return concat(...parts);
}
