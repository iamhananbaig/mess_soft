import { useState } from 'react';
import { ArrowsClockwise, Bluetooth, CheckCircle, Usb, Warning } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePrinterStatus } from '@/hooks/usePrinterStatus';
import { showToast } from '@/lib/toast';
import { printer } from '@/services/printer';

/**
 * Printer status with connect / reconnect / disconnect. Shared by the top-bar
 * printer button, the POS status line and the print dialog.
 */
export function PrinterConnectPanel({ disabled = false }: { disabled?: boolean }) {
  const { state, name } = usePrinterStatus();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoCut, setAutoCut] = useState(printer.autoCut);
  const busy = picking || state === 'connecting';

  const reconnect = async () => {
    setError(null);
    if (await printer.reconnect()) {
      showToast(`Reconnected to ${printer.printerName}`, 'success');
    } else {
      setError(`Couldn't reach ${printer.printerName || 'the printer'}. Check it is on and charged, then try again — or connect it again below.`);
    }
  };

  const connect = async (type: 'bluetooth' | 'serial') => {
    setPicking(true);
    setError(null);
    try {
      const ok = type === 'bluetooth' ? await printer.connectBluetooth() : await printer.connectSerial();
      if (ok) showToast(`Connected to ${printer.printerName}`, 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPicking(false);
    }
  };

  const disconnect = () => {
    printer.disconnect();
    showToast('Printer disconnected', 'success');
  };

  const supported = printer.isWebBluetoothAvailable || printer.isWebSerialAvailable;

  return (
    <div className="space-y-3">
      {state === 'ready' ? (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="size-4 shrink-0" />
          <span className="font-medium">{name || 'Printer'} ready</span>
        </div>
      ) : busy ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          <span>{picking ? 'Connecting…' : `Reconnecting to ${name || 'printer'}…`}</span>
        </div>
      ) : state === 'offline' ? (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <Warning className="size-4 shrink-0" />
          <span className="font-medium">{name || 'Printer'} is not connected</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Warning className="size-4 shrink-0" />
          <span>No printer connected on this device</span>
        </div>
      )}

      {state === 'offline' && !busy && (
        <Button variant="outline" size="sm" onClick={reconnect} disabled={disabled}>
          <ArrowsClockwise className="size-3.5 mr-1.5" />
          Reconnect
        </Button>
      )}

      {state !== 'ready' && !busy && (
        supported ? (
          <div className="flex flex-wrap items-center gap-2">
            {state === 'offline' && <span className="text-xs text-muted-foreground">Change printer:</span>}
            {printer.isWebBluetoothAvailable && (
              <Button variant="outline" size="sm" onClick={() => connect('bluetooth')} disabled={disabled}>
                <Bluetooth className="size-3.5 mr-1.5" />
                Bluetooth
              </Button>
            )}
            {printer.isWebSerialAvailable && (
              <Button variant="outline" size="sm" onClick={() => connect('serial')} disabled={disabled}>
                <Usb className="size-3.5 mr-1.5" />
                USB
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This browser can't reach printers. Use Chrome or Edge, and open the app over HTTPS.
          </p>
        )
      )}

      {state === 'ready' && (
        <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs px-2" onClick={disconnect} disabled={disabled}>
          Disconnect
        </Button>
      )}

      {/* Per-printer: cutter or tear-off. Remembered on this device. */}
      {state !== 'none' && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="size-3.5 accent-current"
            checked={autoCut}
            disabled={disabled}
            onChange={(e) => {
              printer.autoCut = e.target.checked;
              setAutoCut(e.target.checked);
            }}
          />
          Printer has an auto-cutter
        </label>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
