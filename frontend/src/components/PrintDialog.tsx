import { useState, useEffect, useMemo } from 'react';
import { encodeReceiptCopies } from '@/lib/escpos';
import { useReceiptSettings } from '@/hooks/useReceiptSettings';
import { SlipPreview } from '@/components/SlipPreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PrinterConnectPanel } from '@/components/PrinterConnectPanel';
import { usePrinterStatus } from '@/hooks/usePrinterStatus';
import { printer } from '@/services/printer';
import { showToast } from '@/lib/toast';
import { Printer } from '@phosphor-icons/react';
import type { ReceiptCopy, ReceiptData } from '@/types/receipt';

type CopyChoice = 'both' | ReceiptCopy;

const COPY_CHOICES: { value: CopyChoice; label: string; copies: ReceiptCopy[] }[] = [
  { value: 'both', label: 'Both', copies: ['customer', 'accounts'] },
  { value: 'customer', label: 'Customer', copies: ['customer'] },
  { value: 'accounts', label: 'Accounts', copies: ['accounts'] },
];

interface PrintDialogProps {
  data: ReceiptData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reprint of a past sale: slips are marked DUPLICATE. */
  reprint?: boolean;
}

export function PrintDialog({ data, open, onOpenChange, reprint = false }: PrintDialogProps) {
  const { state: printerState } = usePrinterStatus();
  const [printing, setPrinting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copyChoice, setCopyChoice] = useState<CopyChoice>('both');
  const [showPreview, setShowPreview] = useState(false);
  const settings = useReceiptSettings();
  const selectedCopies = COPY_CHOICES.find((c) => c.value === copyChoice)!.copies;
  const previewBytes = useMemo(
    () => (data && showPreview ? encodeReceiptCopies(data, selectedCopies, { reprint, autoCut: printer.autoCut, settings }) : null),
    [data, showPreview, selectedCopies, reprint, settings],
  );

  useEffect(() => {
    if (!open) return;
    setPrinting(false);
    setLastError(null);
    setCopyChoice('both');
    // A printer was set up before but the link dropped — try to restore it silently.
    if (printer.isConfigured && !printer.isConnected) void printer.reconnect();
  }, [open]);

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const choice = COPY_CHOICES.find((c) => c.value === copyChoice)!;
      await printer.printReceipt(data, { copies: choice.copies, reprint, settings });
      showToast(choice.copies.length > 1 ? 'Customer and accounts copies printed' : `${choice.label} copy printed`, 'success');
      onOpenChange(false);
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setPrinting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showPreview ? 'sm:max-w-lg max-h-[90vh] flex flex-col' : 'sm:max-w-sm'} showCloseButton={!printing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-4" />
            Print Receipt?
          </DialogTitle>
          <DialogDescription>
            {data ? `Receipt #${data.receipt_number} — Rs.${data.total.toLocaleString('en-PK')}` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Only this middle section scrolls; header and Print button stay visible. */}
        <div className="min-h-0 flex-1 overflow-y-auto space-y-3 py-2">
          <PrinterConnectPanel disabled={printing} />

          {/* Which copies to print */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Copies:</span>
            <div className="flex gap-1">
              {COPY_CHOICES.map((c) => (
                <Button
                  key={c.value}
                  type="button"
                  size="sm"
                  variant={copyChoice === c.value ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setCopyChoice(c.value)}
                  disabled={printing}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>

          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Hide preview' : 'Show preview'}
          </Button>
          {previewBytes && (
            <div className="overflow-x-auto rounded-md bg-muted p-3">
              <SlipPreview bytes={previewBytes} />
            </div>
          )}

          {lastError && (
            <p className="text-xs text-destructive">{lastError}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={printing}
          >
            Cancel
          </Button>
          <Button
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={handlePrint}
            disabled={printing || printerState === 'connecting' || printerState === 'none'}
          >
            {printing ? <Spinner className="size-4 mr-2" /> : null}
            {printing ? 'Printing...' : 'Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
