import { Receipt } from '@/components/Receipt';
import type { ReceiptData } from '@/types/receipt';
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
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Receipt #{data.receipt_number}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto flex justify-center py-2">
          <Receipt data={data} variant="duplicate" />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={() => onPrint?.(data)}
          >
            <Printer className="size-4 mr-2" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
