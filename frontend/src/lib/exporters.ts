// Report export to Excel (.xlsx) and PDF. The libraries are loaded only when
// someone actually exports, so they never slow down the POS.

export interface ExportColumn<T> {
  header: string;
  /** Value for the cell. Numbers stay numbers in Excel (sortable, summable). */
  value: (row: T) => string | number | null | undefined;
  /** 'money' formats as PKR in PDF and as a number with separators in Excel. */
  type?: 'text' | 'number' | 'money';
  /** PDF column width hint. */
  width?: number;
}

export interface ExportTable<T> {
  /** Sheet name in Excel / section title in PDF. */
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Optional totals row (same column order); empty strings for blank cells. */
  totals?: (string | number)[];
}

export interface ExportDocument {
  /** File name without extension. */
  filename: string;
  /** Heading on the PDF, e.g. "Daily report — 17 Nov 2026". */
  heading: string;
  /** Second line, e.g. active filters. */
  subheading?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tables: ExportTable<any>[];
}

const money = (n: number) => `Rs.${Math.round(n).toLocaleString('en-PK')}`;
const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'report';
const sheetName = (s: string) => s.replace(/[[\]*?/\\:]/g, ' ').slice(0, 31) || 'Sheet';

export async function exportExcel(doc: ExportDocument): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  const sheets = doc.tables.map((t) => {
    const header = t.columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
    const body = t.rows.map((row) =>
      t.columns.map((c) => {
        const v = c.value(row);
        if (v === null || v === undefined || v === '') return null;
        if (c.type === 'number' || c.type === 'money') {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? { type: Number, value: n, format: c.type === 'money' ? '#,##0' : '#,##0.##' } : { type: String, value: String(v) };
        }
        return { type: String, value: String(v) };
      }),
    );
    const totals = t.totals
      ? [t.totals.map((v) => (v === '' ? null : typeof v === 'number' ? { type: Number, value: v, format: '#,##0', fontWeight: 'bold' as const } : { type: String, value: v, fontWeight: 'bold' as const }))]
      : [];
    return {
      data: [header, ...body, ...totals],
      columns: t.columns.map((c) => ({ width: Math.max(10, Math.min(40, c.width ?? c.header.length + 4)) })),
      sheet: sheetName(t.title),
    };
  });

  const blob = await writeXlsxFile(
    sheets.map((s) => ({ data: s.data, sheet: s.sheet, columns: s.columns })),
  ).toBlob();
  downloadBlob(blob, `${safeName(doc.filename)}.xlsx`);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPdf(doc: ExportDocument): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const widest = Math.max(...doc.tables.map((t) => t.columns.length));
  const pdf = new jsPDF({ orientation: widest > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const margin = 36;

  pdf.setFontSize(14);
  pdf.text(doc.heading, margin, margin + 4);
  let y = margin + 20;
  if (doc.subheading) {
    pdf.setFontSize(9);
    pdf.setTextColor(110);
    pdf.text(doc.subheading, margin, y);
    pdf.setTextColor(0);
    y += 14;
  }

  for (const t of doc.tables) {
    if (doc.tables.length > 1) {
      pdf.setFontSize(11);
      pdf.text(t.title, margin, y + 8);
      y += 14;
    }
    const fmt = (c: ExportColumn<unknown>, v: unknown) => {
      if (v === null || v === undefined || v === '') return '';
      if (c.type === 'money') return money(Number(v));
      if (c.type === 'number') return Number(v).toLocaleString('en-PK', { maximumFractionDigits: 2 });
      return String(v);
    };
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [t.columns.map((c) => c.header)],
      body: t.rows.map((row) => t.columns.map((c) => fmt(c, c.value(row)))),
      foot: t.totals ? [t.totals.map((v, i) => (typeof v === 'number' ? fmt(t.columns[i], v) : v))] : undefined,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [33, 33, 33] },
      footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(
        t.columns.map((c, i) => [i, c.type === 'money' || c.type === 'number' ? { halign: 'right' as const } : {}]),
      ),
      showFoot: 'lastPage',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((pdf as any).lastAutoTable?.finalY ?? y) + 18;
  }

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`Printed ${new Date().toLocaleString('en-PK')} · page ${p} of ${pages}`, margin, pdf.internal.pageSize.getHeight() - 16);
  }
  pdf.save(`${safeName(doc.filename)}.pdf`);
}
