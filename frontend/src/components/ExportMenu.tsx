import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { showErrorToast } from '@/lib/toast';
import type { ExportDocument } from '@/lib/exporters';
import { DownloadSimple, FileXls, FilePdf } from '@phosphor-icons/react';

/** "Export ▾" → Excel / PDF for whatever the current report shows. */
export function ExportMenu({ build, disabled }: { build: () => ExportDocument | null; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);

  const run = async (kind: 'excel' | 'pdf') => {
    const doc = build();
    if (!doc) return;
    setBusy(true);
    try {
      const { exportExcel, exportPdf } = await import('@/lib/exporters');
      await (kind === 'excel' ? exportExcel(doc) : exportPdf(doc));
    } catch (err) {
      showErrorToast(err, 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-9" disabled={disabled || busy} />}>
        {busy ? <Spinner className="size-4" /> : <DownloadSimple className="size-4" />}
        <span className="ml-1.5">Export</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run('excel')}><FileXls className="size-4" /> Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('pdf')}><FilePdf className="size-4" /> PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
