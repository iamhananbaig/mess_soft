import { renderToString } from 'react-dom/server';
import { formatPKR } from '@/lib/format';

export interface ReceiptData {
  canteen_name: string;
  branch_name: string;
  date: string;
  time: string;
  receipt_number: string;
  cashier: string;
  items: {
    name: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  total: number;
  payment_method: string;
  amount_received: number | null;
  change: number | null;
}

const DOUBLE = '══════════════════════════════════════';
const SINGLE = '────────────────────────────────────';

function esc(str: string | number): string {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export function Receipt({ data, variant = 'original' }: { data: ReceiptData; variant?: 'original' | 'duplicate' }) {
  const isCash = data.payment_method === 'Cash';

  return (
    <div className="receipt" style={{ width: '80mm', fontFamily: 'monospace', padding: '4mm', fontSize: '11px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '4mm' }}>
        <div style={{ fontSize: '10px', letterSpacing: '1px' }}>{DOUBLE}</div>
        <div style={{ fontWeight: 'bold', fontSize: '14px', margin: '2mm 0', letterSpacing: '0.5px' }}>{data.canteen_name}</div>
        <div style={{ fontSize: '10px' }}>{data.branch_name}</div>
        <div style={{ fontSize: '10px', marginTop: '2mm' }}>{DOUBLE}</div>
      </div>

      {/* Info */}
      <div style={{ fontSize: '10px', marginBottom: '3mm', lineHeight: '1.6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Date: {data.date}</span>
          <span>Time: {data.time}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Receipt No: {data.receipt_number}</span>
          <span style={{ fontWeight: 'bold' }}>{variant === 'duplicate' ? 'DUPLICATE' : 'ORIGINAL'}</span>
        </div>
        <div>Cashier: {data.cashier}</div>
      </div>

      {/* Items table */}
      <div style={{ fontSize: '10px', color: '#888' }}>{SINGLE}</div>
      <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginTop: '1mm', marginBottom: '1mm' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th style={{ textAlign: 'center', width: '12%' }}>Qty</th>
            <th style={{ textAlign: 'right', width: '18%' }}>Rate</th>
            <th style={{ textAlign: 'right', width: '22%' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td style={{ paddingTop: '1mm' }}>{item.name}</td>
              <td style={{ textAlign: 'center', paddingTop: '1mm' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right', paddingTop: '1mm' }}>{String(item.rate).padStart(5)}</td>
              <td style={{ textAlign: 'right', paddingTop: '1mm' }}>{String(item.amount).padStart(6)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: '10px', color: '#888' }}>{SINGLE}</div>

      {/* Total */}
      <div style={{ marginTop: '2mm', marginBottom: '2mm' }}>
        <div style={{ fontSize: '10px' }}>{DOUBLE}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', padding: '1.5mm 0' }}>
          <span>TOTAL</span>
          <span>{formatPKR(data.total, { receipt: true })}</span>
        </div>
        <div style={{ fontSize: '10px' }}>{DOUBLE}</div>
      </div>

      {/* Payment */}
      <div style={{ fontSize: '10px', marginTop: '2mm', lineHeight: '1.6' }}>
        <div>Payment Method: {data.payment_method}</div>
        {isCash && data.amount_received !== null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Amount Received:</span>
              <span>{formatPKR(data.amount_received, { receipt: true })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Change:</span>
              <span>{formatPKR(data.change ?? 0, { receipt: true })}</span>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '4mm' }}>
        <div style={{ fontSize: '10px' }}>Operator: {data.cashier}</div>
        <div style={{ textAlign: 'center', marginTop: '3mm' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>Thank you for visiting IDC!</div>
          <div style={{ fontSize: '9px', color: '#666', marginTop: '1mm' }}>Computer-generated receipt</div>
        </div>
        <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '2mm' }}>{DOUBLE}</div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react/only-export-components
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
          @page { margin: 0; size: 80mm auto; }
          body { margin: 0; padding: 0; }
        }
        body { font-family: monospace; font-size: 11px; margin: 0; }
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
