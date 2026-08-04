export interface ReceiptData {
  canteen_name: string;
  receipt_number: string;
  date: string;
  cashier: string;
  items: {
    name: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }[];
  total: number;
  payment_method: string;
}

export function Receipt({ data }: { data: ReceiptData }) {
  return (
    <div className="receipt" style={{ width: '80mm', fontFamily: 'monospace', padding: '5mm', fontSize: '12px' }}>
      <div style={{ textAlign: 'center', marginBottom: '4mm' }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{data.canteen_name}</div>
        <div style={{ fontSize: '10px', color: '#666' }}>────────────────────</div>
      </div>

      <div style={{ fontSize: '10px', marginBottom: '2mm' }}>
        <div>Date: {data.date}</div>
        <div>Receipt #: {data.receipt_number}</div>
        <div>Cashier: {data.cashier}</div>
      </div>

      <div style={{ fontSize: '10px', color: '#666', margin: '2mm 0' }}>────────────────────</div>

      <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th style={{ textAlign: 'center' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i}>
              <td>{item.name}</td>
              <td style={{ textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right' }}>{item.unit_price}</td>
              <td style={{ textAlign: 'right' }}>{item.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: '10px', color: '#666', margin: '2mm 0' }}>────────────────────</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
        <span>Total:</span>
        <span>Rs.{data.total}</span>
      </div>
      <div style={{ fontSize: '10px', marginTop: '1mm' }}>Payment: {data.payment_method}</div>

      <div style={{ fontSize: '10px', color: '#666', margin: '2mm 0' }}>────────────────────</div>
      <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '2mm' }}>Thank you!</div>
    </div>
  );
}

// eslint-disable-next-line react/only-export-components
export function printReceipt(data: ReceiptData) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt #${data.receipt_number}</title>
      <style>
        @media print {
          @page { margin: 0; size: 80mm auto; }
          body { margin: 0; padding: 0; }
        }
        body { font-family: monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <div id="receipt"></div>
      <script>
        window.onload = function() { window.print(); window.close(); }
      </script>
    </body>
    </html>
  `);

  const receiptEl = printWindow.document.getElementById('receipt');
  if (receiptEl) {
    receiptEl.innerHTML = `
      <div style="text-align:center;margin-bottom:4mm">
        <div style="font-weight:bold;font-size:16px">${data.canteen_name}</div>
        <div style="font-size:10px;color:#666">────────────────────</div>
      </div>
      <div style="font-size:10px;margin-bottom:2mm">
        <div>Date: ${data.date}</div>
        <div>Receipt #: ${data.receipt_number}</div>
        <div>Cashier: ${data.cashier}</div>
      </div>
      <div style="font-size:10px;color:#666;margin:2mm 0">────────────────────</div>
      <table style="width:100%;font-size:10px;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid #ddd">
            <th style="text-align:left">Item</th>
            <th style="text-align:center">Qty</th>
            <th style="text-align:right">Price</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item) => `
            <tr>
              <td>${item.name}</td>
              <td style="text-align:center">${item.quantity}</td>
              <td style="text-align:right">${item.unit_price}</td>
              <td style="text-align:right">${item.amount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="font-size:10px;color:#666;margin:2mm 0">────────────────────</div>
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px">
        <span>Total:</span>
        <span>Rs.${data.total}</span>
      </div>
      <div style="font-size:10px;margin-top:1mm">Payment: ${data.payment_method}</div>
      <div style="font-size:10px;color:#666;margin:2mm 0">────────────────────</div>
      <div style="text-align:center;font-size:10px;margin-top:2mm">Thank you!</div>
    `;
  }
}
