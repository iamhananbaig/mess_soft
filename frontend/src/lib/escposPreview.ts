// Interprets the ESC/POS bytes produced by escpos.ts back into styled lines,
// so on-screen previews show exactly what the printer receives.
// Only the commands our encoder emits are understood; anything else is skipped.

export interface PreviewRun {
  text: string;
  bold: boolean;
  /** Character width multiplier (1–8). */
  w: number;
  /** Character height multiplier (1–8). */
  h: number;
}

export type PreviewLine =
  | { kind: 'text'; align: 'left' | 'center' | 'right'; runs: PreviewRun[] }
  | { kind: 'cut' };

export interface SlipPreviewModel {
  /** Characters per line (Font B), from the GS W print width. */
  columns: number;
  lines: PreviewLine[];
}

const FONT_B_DOT_WIDTH = 9;
const decoder = new TextDecoder();

export function interpretEscPos(data: Uint8Array): SlipPreviewModel {
  const lines: PreviewLine[] = [];
  let columns = 42;
  let alignMode: 'left' | 'center' | 'right' = 'left';
  let bold = false;
  let w = 1;
  let h = 1;
  let runs: PreviewRun[] = [];
  let pending: number[] = [];

  const flushText = () => {
    if (pending.length === 0) return;
    const text = decoder.decode(new Uint8Array(pending));
    pending = [];
    const last = runs[runs.length - 1];
    if (last && last.bold === bold && last.w === w && last.h === h) last.text += text;
    else runs.push({ text, bold, w, h });
  };
  const endLine = () => {
    flushText();
    lines.push({ kind: 'text', align: alignMode, runs });
    runs = [];
  };

  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    if (b === 0x0a) { endLine(); continue; }
    if (b === 0x1b) {
      const cmd = data[i + 1];
      flushText();
      if (cmd === 0x40) { alignMode = 'left'; bold = false; w = 1; h = 1; i += 1; continue; } // ESC @
      if (cmd === 0x4d) { i += 2; continue; } // ESC M n (font)
      if (cmd === 0x61) { const n = data[i + 2]; alignMode = n === 1 ? 'center' : n === 2 ? 'right' : 'left'; i += 2; continue; }
      if (cmd === 0x45) { bold = data[i + 2] === 1; i += 2; continue; } // ESC E n
      if (cmd === 0x64) { // ESC d n — print buffer then feed n lines
        if (runs.length || pending.length) endLine();
        for (let k = 0; k < data[i + 2]; k++) lines.push({ kind: 'text', align: 'left', runs: [] });
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (b === 0x1d) {
      const cmd = data[i + 1];
      flushText();
      if (cmd === 0x21) { const n = data[i + 2]; w = (n >> 4) + 1; h = (n & 0x0f) + 1; i += 2; continue; } // GS ! n
      if (cmd === 0x57) { columns = Math.floor((data[i + 2] | (data[i + 3] << 8)) / FONT_B_DOT_WIDTH); i += 3; continue; } // GS W
      if (cmd === 0x4c) { i += 3; continue; } // GS L
      if (cmd === 0x56) { if (runs.length) endLine(); lines.push({ kind: 'cut' }); i += 2; continue; } // GS V m
      i += 1;
      continue;
    }
    pending.push(b);
  }
  if (runs.length || pending.length) endLine();

  return { columns, lines };
}
