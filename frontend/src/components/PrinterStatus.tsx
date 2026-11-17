import { Printer } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PrinterConnectPanel } from '@/components/PrinterConnectPanel';
import { usePrinterStatus } from '@/hooks/usePrinterStatus';

/**
 * Compact printer status for the POS cart, so the cashier sees a problem before
 * the sale, not after. The saved printer is reconnected by the top-bar button.
 */
export function PrinterStatus() {
  const { state, name } = usePrinterStatus();

  const label =
    state === 'ready' ? `${name || 'Printer'} ready`
    : state === 'connecting' ? 'Connecting printer…'
    : state === 'offline' ? 'Printer offline'
    : 'No printer connected';
  const action = state === 'ready' ? 'Change' : state === 'offline' ? 'Reconnect' : state === 'none' ? 'Connect' : null;

  return (
    <div className="flex items-center justify-between gap-2 text-xs mb-2">
      <span className={`flex items-center gap-1.5 ${state === 'ready' ? 'text-green-600' : state === 'connecting' ? 'text-muted-foreground' : 'text-destructive'}`}>
        <Printer className="size-3.5" />
        {label}
      </span>
      {action && (
        <Popover>
          <PopoverTrigger className="underline text-muted-foreground hover:text-foreground">{action}</PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <PrinterConnectPanel />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
