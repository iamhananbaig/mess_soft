import { useSyncExternalStore } from 'react';
import { printer } from '@/services/printer';

export type PrinterState = 'ready' | 'connecting' | 'offline' | 'none';

export interface PrinterStatus {
  state: PrinterState;
  name: string;
}

let cached: PrinterStatus = { state: 'none', name: '' };

function snapshot(): PrinterStatus {
  const state: PrinterState = printer.isConnected
    ? 'ready'
    : printer.isConnecting
      ? 'connecting'
      : printer.isConfigured
        ? 'offline'
        : 'none';
  const name = printer.printerName;
  // Same object while nothing changed, as useSyncExternalStore requires.
  if (cached.state !== state || cached.name !== name) cached = { state, name };
  return cached;
}

const subscribe = (onChange: () => void) => printer.subscribe(onChange);

/** Live printer status (connected, reconnecting, offline, not set up). */
export function usePrinterStatus(): PrinterStatus {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
