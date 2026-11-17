import { useEffect } from 'react';
import { Printer } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PrinterConnectPanel } from '@/components/PrinterConnectPanel';
import { usePrinterStatus, type PrinterState } from '@/hooks/usePrinterStatus';
import { printer } from '@/services/printer';

const DOT: Record<PrinterState, string> = {
  ready: 'bg-green-500',
  connecting: 'bg-amber-500 animate-pulse',
  offline: 'bg-destructive',
  none: 'bg-muted-foreground/40',
};

const LABEL: Record<PrinterState, string> = {
  ready: 'Printer ready',
  connecting: 'Connecting printer…',
  offline: 'Printer offline',
  none: 'No printer',
};

/**
 * Top-bar printer status on every page. Reconnects the saved printer when the
 * app opens, so it is ready before the first sale; click to connect or change.
 */
export function PrinterButton() {
  const { state, name } = usePrinterStatus();

  useEffect(() => {
    if (printer.isConfigured && !printer.isConnected) void printer.reconnect();
  }, []);

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="gap-2" aria-label={LABEL[state]} title={LABEL[state]} />}
      >
        <span className="relative">
          <Printer className="size-4" />
          <span className={`absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-background ${DOT[state]}`} />
        </span>
        <span className="hidden sm:inline text-xs">{state === 'ready' && name ? name : LABEL[state]}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PrinterConnectPanel />
      </PopoverContent>
    </Popover>
  );
}
