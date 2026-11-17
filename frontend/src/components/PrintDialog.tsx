import { useState, useEffect, useMemo } from 'react';
import { encodeReceiptCopies } from '@/lib/escpos';
import { useReceiptSettings } from '@/hooks/useReceiptSettings';
import { SlipPreview } from '@/components/SlipPreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { printer } from '@/services/printer';
import { showToast } from '@/lib/toast';
import { Printer, Bluetooth, Usb, Warning, CheckCircle, ArrowsClockwise } from '@phosphor-icons/react';
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
  const [connected, setConnected] = useState(printer.isConnected);
  const [printerName, setPrinterName] = useState(printer.printerName);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [copyChoice, setCopyChoice] = useState<CopyChoice>('both');
  const [autoCut, setAutoCut] = useState(printer.autoCut);
  const [showPreview, setShowPreview] = useState(false);
  const settings = useReceiptSettings();
  const selectedCopies = COPY_CHOICES.find((c) => c.value === copyChoice)!.copies;
  const previewBytes = useMemo(
    () => (data && showPreview ? encodeReceiptCopies(data, selectedCopies, { reprint, autoCut, settings }) : null),
    [data, showPreview, selectedCopies, reprint, autoCut, settings],
  );

  // Keep status live while the dialog is open (USB unplugged, BLE dropped, auto-reconnected).
  useEffect(() => printer.subscribe(() => {
    setConnected(printer.isConnected);
    setPrinterName(printer.printerName);
  }), []);

  useEffect(() => {
    if (!open) return;
    setConnected(printer.isConnected);
    setPrinterName(printer.printerName);
    setPrinting(false);
    setLastError(null);
    setCopyChoice('both');
    setAutoCut(printer.autoCut);

    // A printer was set up before but the link dropped — try to restore it silently.
    if (printer.isConfigured && !printer.isConnected) {
      setConnecting(true);
      printer.reconnect().finally(() => setConnecting(false));
    } else {
      setConnecting(false);
    }
  }, [open]);

  const handleReconnect = async () => {
    setConnecting(true);
    setLastError(null);
    const ok = await printer.reconnect();
    setConnecting(false);
    if (ok) {
      showToast(`Reconnected to ${printer.printerName}`, 'success');
    } else {
      setLastError(`Couldn't reach ${printer.printerName || 'the printer'}. Check power and cable/Bluetooth, or use "Change printer".`);
    }
  };

  const handleConnect = async (type: 'bluetooth' | 'serial') => {
    setConnecting(true);
    setLastError(null);
    try {
      let success = false;
      if (type === 'bluetooth') {
        success = await printer.connectBluetooth();
      } else {
        success = await printer.connectSerial();
      }
      if (success) {
        setConnected(true);
        setPrinterName(printer.printerName);
        showToast(`Connected to ${printer.printerName}`, 'success');
      }
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    printer.disconnect();
    setConnected(false);
    setPrinterName('');
    showToast('Printer disconnected', 'success');
  };

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


  const hasWebBluetooth = printer.isWebBluetoothAvailable;
  const hasWebSerial = printer.isWebSerialAvailable;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showPreview ? 'sm:max-w-md max-h-[90vh] flex flex-col' : 'sm:max-w-sm'} showCloseButton={!printing}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-4" />
            Print Receipt?
          </DialogTitle>
          <DialogDescription>
            {data ? `Receipt #${data.receipt_number} — Rs.${data.total.toLocaleString('en-PK')}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Connection status */}
          {connected ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="size-4" />
              <span className="font-medium">{printerName || 'Printer connected'}</span>
            </div>
          ) : printer.isConfigured ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <Warning className="size-4" />
              <span className="font-medium">{printerName || 'Printer'} is not connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Warning className="size-4" />
              <span>No printer connected</span>
            </div>
          )}

          {/* Saved printer dropped: one-click reconnect, no device picker */}
          {!connected && !connecting && printer.isConfigured && (
            <Button variant="outline" size="sm" onClick={handleReconnect}>
              <ArrowsClockwise className="size-3.5 mr-1.5" />
              Reconnect
            </Button>
          )}

          {/* Connect buttons */}
          {!connected && !connecting && (
            <div className="flex flex-wrap items-center gap-2">
              {printer.isConfigured && (
                <span className="text-xs text-muted-foreground">Change printer:</span>
              )}
              {hasWebBluetooth && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConnect('bluetooth')}
                >
                  <Bluetooth className="size-3.5 mr-1.5" />
                  Bluetooth
                </Button>
              )}
              {hasWebSerial && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleConnect('serial')}
                >
                  <Usb className="size-3.5 mr-1.5" />
                  USB
                </Button>
              )}
            </div>
          )}

          {connecting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              <span>{printer.isConfigured ? 'Reconnecting to printer...' : 'Connecting...'}</span>
            </div>
          )}

          {connected && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive h-7 text-xs"
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          )}

          {/* Per-printer: cutter or tear-off. Remembered on this device. */}
          {printer.isConfigured && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="size-3.5 accent-current"
                checked={autoCut}
                onChange={(e) => {
                  printer.autoCut = e.target.checked;
                  setAutoCut(e.target.checked);
                }}
                disabled={printing}
              />
              Printer has an auto-cutter
            </label>
          )}

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
            <div className="max-h-[45vh] overflow-auto rounded-md bg-muted p-3 flex justify-center">
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
            disabled={printing || connecting || !printer.isConfigured}
          >
            {printing ? <Spinner className="size-4 mr-2" /> : null}
            {printing ? 'Printing...' : 'Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
