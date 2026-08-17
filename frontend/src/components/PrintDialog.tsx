import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { printer } from '@/services/printer';
import { showToast } from '@/lib/toast';
import { Printer, Bluetooth, Usb, Warning, CheckCircle } from '@phosphor-icons/react';
import type { ReceiptData } from '@/types/receipt';

interface PrintDialogProps {
  data: ReceiptData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintDialog({ data, open, onOpenChange }: PrintDialogProps) {
  const [connected, setConnected] = useState(printer.isConnected);
  const [printerName, setPrinterName] = useState(printer.printerName);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setConnected(printer.isConnected);
      setPrinterName(printer.printerName);
      setConnecting(false);
      setPrinting(false);
      setLastError(null);
    }
  }, [open]);

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
      await printer.printReceipt(data);
      showToast('Receipt sent to printer', 'success');
      onOpenChange(false);
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  const handleBrowserPrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      const { printReceipt } = await import('@/lib/browserPrint');
      printReceipt(data);
      onOpenChange(false);
    } catch {
      setLastError('Failed to open browser print dialog');
    } finally {
      setPrinting(false);
    }
  };

  const hasWebBluetooth = printer.isWebBluetoothAvailable;
  const hasWebSerial = printer.isWebSerialAvailable;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!printing}>
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
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Warning className="size-4" />
              <span>No printer connected</span>
            </div>
          )}

          {/* Connect buttons */}
          {!connected && !connecting && (
            <div className="flex gap-2">
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
              <span>Connecting...</span>
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
            variant="outline"
            onClick={handleBrowserPrint}
            disabled={printing}
          >
            Print via Browser
          </Button>
          <Button
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={handlePrint}
            disabled={printing}
          >
            {printing ? <Spinner className="size-4 mr-2" /> : null}
            {printing ? 'Printing...' : 'Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
