import { useEffect, useState } from 'react';
import { printer } from '@/services/printer';
import { Printer } from '@phosphor-icons/react';

/**
 * Compact printer status for the POS cart. Reconnects the saved printer on
 * mount so the cashier sees a problem before the sale, not after.
 */
export function PrinterStatus() {
  const [connected, setConnected] = useState(printer.isConnected);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = printer.subscribe(() => setConnected(printer.isConnected));
    if (printer.isConfigured && !printer.isConnected) {
      setBusy(true);
      printer.reconnect().finally(() => setBusy(false));
    }
    return unsubscribe;
  }, []);

  if (!printer.isConfigured) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive mb-2">
        <Printer className="size-3.5" />
        No printer set up — connect one after the next sale
      </div>
    );
  }

  const retry = () => {
    setBusy(true);
    printer.reconnect().finally(() => setBusy(false));
  };

  return (
    <div className="flex items-center justify-between gap-2 text-xs mb-2">
      <span className={`flex items-center gap-1.5 ${connected ? 'text-green-600' : 'text-destructive'}`}>
        <Printer className="size-3.5" />
        {busy ? 'Connecting printer…' : connected ? `${printer.printerName} ready` : 'Printer offline'}
      </span>
      {!connected && !busy && (
        <button type="button" className="underline text-muted-foreground hover:text-foreground" onClick={retry}>
          Reconnect
        </button>
      )}
    </div>
  );
}
