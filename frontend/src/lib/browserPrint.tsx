import { renderToString } from 'react-dom/server';
import { Receipt } from '@/components/Receipt';
import type { ReceiptData } from '@/types/receipt';

function esc(str: string | number): string {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export function printReceipt(data: ReceiptData, variant: 'original' | 'duplicate' = 'original') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = renderToString(<Receipt data={data} variant={variant} />);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt #${esc(data.receipt_number)}</title>
      <style>
        @media print {
          @page { size: 80mm auto; }
        }
        body { font-family: monospace; font-size: 11px; }
      </style>
    </head>
    <body>
      ${html}
      <script>window.onload = function() { window.print(); window.close(); }</script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
