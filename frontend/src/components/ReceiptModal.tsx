import { useMemo } from 'react';
import type { ReceiptData } from '@/types/receipt';
import { encodeReceipt } from '@/lib/escpos';
import { useReceiptSettings } from '@/hooks/useReceiptSettings';
import { SlipPreview } from '@/components/SlipPreview';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from '@phosphor-icons/react';

interface ReceiptModalProps {
  data: ReceiptData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint?: (data: ReceiptData) => void;
}

export function ReceiptModal({ data, open, onOpenChange, onPrint }: ReceiptModalProps) {
  const settings = useReceiptSettings();
  const bytes = useMemo(
    () => (data ? encodeReceipt(data, { copy: 'customer', reprint: true, settings }) : null),
    [data, settings],
  );

  if (!data || !bytes) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Receipt #{data.receipt_number}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto flex justify-center rounded-md bg-muted p-3">
          <SlipPreview bytes={bytes} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => onPrint?.(data)}>
            <Printer className="size-4 mr-2" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
