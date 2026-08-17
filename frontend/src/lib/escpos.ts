// ESC/POS encoder for thermal receipt printers
//
// NOTE: TextEncoder emits UTF-8. Many ESC/POS printers do not natively
// interpret arbitrary UTF-8 and may use CP437/CP850/CP932 code pages.
// In practice, this application prints English/PKR receipts with ASCII
// item names. Non-ASCII characters (e.g. Urdu/Arabic) will likely produce
// garbled output on most thermal printers — this is a hardware limitation.
// Avoid introducing invalid ESC/POS byte sequences from user-supplied text.

import type { ReceiptData } from '@/types/receipt';

const TEXT_ENCODER = new TextEncoder();

// ── Printer profile ──────────────────────────────────────────────────

export interface EscPosProfile {
  printWidthDots: number;
  fontBColumns: number;
}

export const DEFAULT_ESC_POS_PROFILE: EscPosProfile = {
  printWidthDots: 576, // 58mm paper — safe default for most POS printers
  fontBColumns: 64,    // 384 / 9 (Font B dot width)
};

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── ESC/POS commands ─────────────────────────────────────────────────

export function initialize(): Uint8Array {
  return bytes(0x1b, 0x40); // ESC @
}

export function selectFontA(): Uint8Array {
  return bytes(0x1b, 0x4d, 0x00); // ESC M 0 — Font A (12x24 dots)
}

export function selectFontB(): Uint8Array {
  return bytes(0x1b, 0x4d, 0x01); // ESC M 1 — Font B (9x14 dots)
}

/** GS L — set left margin in dots. */
export function setLeftMargin(dots: number): Uint8Array {
  const nL = dots & 0xff;
  const nH = (dots >> 8) & 0xff;
  return bytes(0x1d, 0x4c, nL, nH); // GS L nL nH
}

export function setPrintWidth(dots: number): Uint8Array {
  const nL = dots & 0xff;
  const nH = (dots >> 8) & 0xff;
  return bytes(0x1d, 0x57, nL, nH); // GS W nL nH
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

// ── Formatting helpers ───────────────────────────────────────────────

function padRight(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

/** Pad left — never truncates financial or significant values. */
function padLeft(str: string, width: number): string {
  if (str.length >= width) return str;
  return ' '.repeat(width - str.length) + str;
}

function commas(n: number): string {
  return n.toLocaleString('en-US');
}

function line(char: string, width: number): string {
  return char.repeat(width);
}

// ── Receipt encoder ──────────────────────────────────────────────────

export function encodeReceipt(
  data: ReceiptData,
  profile: EscPosProfile = DEFAULT_ESC_POS_PROFILE,
): Uint8Array {
  const parts: Uint8Array[] = [];
  const isCash = data.payment_method === 'Cash';
  const W = profile.fontBColumns;
  const SAFE_W = W - 3; // leave 3 chars (~27 dots) of right margin

  parts.push(initialize());
  parts.push(selectFontB());
  parts.push(setPrintWidth(profile.printWidthDots));

  // Header
  parts.push(align('center'));
  parts.push(bold(true));

  const title = `*** ${data.canteen_name} ***`;

  if (title.length <= Math.floor(W / 2)) {
    parts.push(doubleWidth(true));
    parts.push(text(title));
    parts.push(newline());
    parts.push(doubleWidth(false));
  } else {
    parts.push(text(title));
    parts.push(newline());
  }

  parts.push(bold(false));
  parts.push(text(line('=', W)));
  parts.push(newline());

  // Info
  parts.push(align('left'));
  const halfInfo = Math.floor(SAFE_W / 2);
  parts.push(
    text(
      padRight(`#${data.receipt_number}`, halfInfo) +
        padLeft(`${data.date}  ${data.time}`, halfInfo) +
        '\n'
    )
  );
  parts.push(
    text(
      padRight(`Cashier: ${data.cashier}`, halfInfo) +
        padLeft(data.receipt_number ? 'ORIGINAL' : '', halfInfo) +
        '\n'
    )
  );

  // Separator
  parts.push(text(line('-', W) + '\n'));

  // Column header — column widths fit within SAFE_W
  const itemCol = 18;
  const qtyCol = 11;
  const amtCol = SAFE_W - itemCol - qtyCol; // 10

  parts.push(
    text(
      padRight('Item', itemCol) +
        padRight('Qty x Rate', qtyCol) +
        padLeft('= Amt', amtCol) +
        '\n'
    )
  );
  parts.push(text(line('-', W) + '\n'));

  // Items
  for (const item of data.items) {
    const name = item.name.length > itemCol ? item.name.slice(0, itemCol - 3) + '...' : item.name;
    const qtyRate = `${item.quantity} x ${item.rate}`;
    parts.push(
      text(
        padRight(name, itemCol) +
          padRight(qtyRate, qtyCol) +
          padLeft(String(item.amount), amtCol) +
          '\n'
      )
    );
  }

  // Separator
  parts.push(text(line('-', W) + '\n'));

  // Total — financial amounts are never truncated
  parts.push(text(line('=', W) + '\n'));
  parts.push(align('left'));
  parts.push(bold(true));

  const totalLabel = 'TOTAL';
  const totalText = `Rs.${commas(data.total)}`;
  const totalSpaces = Math.max(1, SAFE_W - totalLabel.length - totalText.length);

  console.debug({
    total: data.total,
    totalText,
    W,
    SAFE_W,
    renderedLength: totalLabel.length + totalSpaces + totalText.length,
  });

  parts.push(
    text(
      totalLabel +
        ' '.repeat(totalSpaces) +
        totalText +
        '\n'
    )
  );
  parts.push(bold(false));
  parts.push(text(line('=', W) + '\n'));

  // Payment
  parts.push(text('\n'));
  if (isCash && data.amount_received !== null) {
    const halfSafe = Math.floor(SAFE_W / 2);
    parts.push(
      text(
        padRight(`Paid: Rs.${commas(data.amount_received)}`, halfSafe) +
          padLeft(`Change: Rs.${commas(data.change ?? 0)}`, halfSafe) +
          '\n'
      )
    );
  } else {
    parts.push(text(`Payment: ${data.payment_method}\n`));
  }

  // Footer
  parts.push(feedLines(1));
  parts.push(text(line('-', W) + '\n'));
  parts.push(feedLines(1));
  parts.push(align('center'));
  parts.push(bold(true));
  parts.push(text('Thank you for visiting!\n'));
  parts.push(bold(false));
  parts.push(text(line('=', W) + '\n'));

  // Cut
  parts.push(feedLines(3));
  parts.push(cut('partial'));

  return concat(...parts);
}
