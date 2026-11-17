// ESC/POS encoder for thermal receipt printers
//
// NOTE: TextEncoder emits UTF-8. Many ESC/POS printers do not natively
// interpret arbitrary UTF-8 and may use CP437/CP850/CP932 code pages.
// In practice, this application prints English/PKR receipts with ASCII
// item names. Non-ASCII characters (e.g. Urdu/Arabic) will likely produce
// garbled output on most thermal printers — this is a hardware limitation.
// Avoid introducing invalid ESC/POS byte sequences from user-supplied text.

import { RECEIPT_COPY_LABELS, type ReceiptCopy, type ReceiptData } from '@/types/receipt';

const TEXT_ENCODER = new TextEncoder();

// ── Printer profile ──────────────────────────────────────────────────

export interface EscPosProfile {
  printWidthDots: number;
  fontBColumns: number;
}

export const DEFAULT_ESC_POS_PROFILE: EscPosProfile = {
  printWidthDots: 384, // 58mm paper — safe default for most POS printers
  fontBColumns: 42,    // 384 / 9 (Font B dot width)
};

/**
 * Blank lines fed after the tear guide when the printer has no cutter. The tear
 * bar sits a few lines above the print head; this pushes the guide just past it.
 * Increase if the tear line stays inside the printer, decrease if there is too
 * much blank paper.
 */
const TEAR_FEED_LINES = 4;

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

// ── Receipt settings ─────────────────────────────────────────────────

/** Shop-wide slip layout, edited on the Receipt Design page (GET/PUT /settings/receipt). */
export interface ReceiptSettings {
  canteen_name: string;
  branch_name: string;
  show_branch: boolean;
  /** Up to 3 lines (address, phone…) printed under the name. */
  header_lines: string;
  footer_text: string;
  show_cashier: boolean;
  show_payment: boolean;
  paper_width: '58' | '80';
  tear_feed_lines: number;
}

/** Matches the slip as printed before settings existed. */
export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  canteen_name: '',
  branch_name: '',
  show_branch: false,
  header_lines: '',
  footer_text: 'Thank you for visiting!',
  show_cashier: true,
  show_payment: true,
  paper_width: '58',
  tear_feed_lines: TEAR_FEED_LINES,
};

export function profileForPaper(width: ReceiptSettings['paper_width']): EscPosProfile {
  return width === '80'
    ? { printWidthDots: 576, fontBColumns: 64 } // 80mm: 576 / 9
    : DEFAULT_ESC_POS_PROFILE;
}

// ── Receipt encoder ──────────────────────────────────────────────────

export interface EncodeReceiptOptions {
  /** Copy label printed under the header (e.g. CUSTOMER COPY). */
  copy: ReceiptCopy;
  /** Reprint of an earlier sale — marked DUPLICATE instead of ORIGINAL. */
  reprint?: boolean;
  /**
   * Printer has an auto-cutter. When false, no cut command is sent; instead a
   * tear guide is printed and the paper is fed past the tear bar.
   */
  autoCut?: boolean;
  /** Layout; the canteen name falls back to the one on the receipt data. */
  settings?: Partial<ReceiptSettings>;
}

/** Encode several copies of one receipt into a single job, each ending in a cut/tear. */
export function encodeReceiptCopies(
  data: ReceiptData,
  copies: ReceiptCopy[],
  options: Omit<EncodeReceiptOptions, 'copy'> = {},
): Uint8Array {
  return concat(...copies.map((copy) => encodeReceipt(data, { ...options, copy })));
}

export function encodeReceipt(data: ReceiptData, options: EncodeReceiptOptions): Uint8Array {
  const { copy, reprint = false, autoCut = false } = options;
  const settings: ReceiptSettings = { ...DEFAULT_RECEIPT_SETTINGS, ...options.settings };
  const profile = profileForPaper(settings.paper_width);
  const canteenName = settings.canteen_name || data.canteen_name;

  const parts: Uint8Array[] = [];
  const isCash = data.payment_method === 'Cash';
  const W = profile.fontBColumns;
  const SAFE_W = W - 3; // leave 3 chars (~27 dots) of right margin
  const rule = (char: string) => text(line(char, W) + '\n');

  parts.push(initialize());
  parts.push(selectFontB());
  parts.push(setPrintWidth(profile.printWidthDots));

  // Header
  parts.push(align('center'));
  parts.push(bold(true));
  const title = `*** ${canteenName} ***`;
  if (title.length <= Math.floor(W / 2)) {
    parts.push(doubleWidth(true));
    parts.push(text(title + '\n'));
    parts.push(doubleWidth(false));
  } else {
    parts.push(text(title + '\n'));
  }
  parts.push(bold(false));

  if (settings.show_branch && settings.branch_name) {
    parts.push(text(settings.branch_name + '\n'));
  }
  for (const headerLine of settings.header_lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3)) {
    parts.push(text(headerLine + '\n'));
  }
  parts.push(rule('='));

  // Voided sale reprint — impossible to miss
  if (data.voided) {
    parts.push(bold(true));
    parts.push(doubleSize(true));
    parts.push(text('** VOID **\n'));
    parts.push(doubleSize(false));
    parts.push(text('Not valid as a receipt\n'));
    parts.push(bold(false));
    parts.push(rule('='));
  }

  // Copy label — prominent so customer and accounts slips are never mixed up
  parts.push(bold(true));
  parts.push(doubleWidth(true));
  parts.push(text(RECEIPT_COPY_LABELS[copy] + '\n'));
  parts.push(doubleWidth(false));
  parts.push(bold(false));
  parts.push(rule('='));

  // Info
  parts.push(align('left'));
  const halfInfo = Math.floor(SAFE_W / 2);
  const status = reprint ? 'DUPLICATE' : 'ORIGINAL';
  parts.push(text(padRight(`#${data.receipt_number}`, halfInfo) + padLeft(`${data.date}  ${data.time}`, halfInfo) + '\n'));
  parts.push(
    text(
      settings.show_cashier
        ? padRight(`Cashier: ${data.cashier}`, halfInfo) + padLeft(status, halfInfo) + '\n'
        : padLeft(status, halfInfo * 2) + '\n',
    ),
  );
  parts.push(rule('-'));

  // Items — the name column absorbs extra width on 80mm paper
  const qtyCol = 11;
  const amtCol = 10;
  const itemCol = SAFE_W - qtyCol - amtCol;
  parts.push(text(padRight('Item', itemCol) + padRight('Qty x Rate', qtyCol) + padLeft('= Amt', amtCol) + '\n'));
  parts.push(rule('-'));
  for (const item of data.items) {
    const name = item.name.length > itemCol ? item.name.slice(0, itemCol - 3) + '...' : item.name;
    parts.push(text(padRight(name, itemCol) + padRight(`${item.quantity} x ${item.rate}`, qtyCol) + padLeft(String(item.amount), amtCol) + '\n'));
  }
  parts.push(rule('-'));

  // Total — financial amounts are never truncated
  parts.push(rule('='));
  parts.push(bold(true));
  const totalLabel = 'TOTAL';
  const totalText = `Rs.${commas(data.total)}`;
  parts.push(text(totalLabel + ' '.repeat(Math.max(1, SAFE_W - totalLabel.length - totalText.length)) + totalText + '\n'));
  parts.push(bold(false));
  parts.push(rule('='));

  // Payment
  if (settings.show_payment) {
    parts.push(text('\n'));
    if (isCash && data.amount_received !== null) {
      const halfSafe = Math.floor(SAFE_W / 2);
      parts.push(
        text(
          padRight(`Paid: Rs.${commas(data.amount_received)}`, halfSafe) +
            padLeft(`Change: Rs.${commas(data.change ?? 0)}`, halfSafe) +
            '\n',
        ),
      );
    } else {
      parts.push(text(`Payment: ${data.payment_method}\n`));
    }
  }

  // Footer
  if (settings.footer_text) {
    parts.push(feedLines(1));
    parts.push(rule('-'));
    parts.push(feedLines(1));
    parts.push(align('center'));
    parts.push(bold(true));
    parts.push(text(settings.footer_text + '\n'));
    parts.push(bold(false));
  }
  parts.push(align('left'));
  parts.push(rule('='));

  if (autoCut) {
    parts.push(feedLines(3));
    parts.push(cut('partial'));
  } else {
    // No cutter: tear guide, then feed so this copy clears the tear bar
    // before the next copy starts printing.
    parts.push(feedLines(1));
    parts.push(align('center'));
    parts.push(text('- - - - - -  TEAR HERE  - - - - - -\n'));
    parts.push(feedLines(settings.tear_feed_lines));
  }

  return concat(...parts);
}
