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

function padLeft(n: number | string, width: number): string {
  return String(n).padStart(width);
}

function formatRs(n: number): string {
  return 'Rs. ' + n.toLocaleString('en-PK');
}

export function Receipt({ data }: { data: ReceiptData }) {
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
        <div>Receipt No: {data.receipt_number}</div>
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
              <td style={{ textAlign: 'right', paddingTop: '1mm' }}>{padLeft(item.rate, 5)}</td>
              <td style={{ textAlign: 'right', paddingTop: '1mm' }}>{padLeft(item.amount, 6)}</td>
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
          <span>{formatRs(data.total)}</span>
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
              <span>{formatRs(data.amount_received)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Change:</span>
              <span>{formatRs(data.change ?? 0)}</span>
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
export function printReceipt(data: ReceiptData) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const isCash = data.payment_method === 'Cash';

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
        body { font-family: monospace; font-size: 11px; }
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

  const doc = printWindow.document;
  const el = doc.getElementById('receipt');
  if (!el) return;

  // --- Header ---
  const header = doc.createElement('div');
  header.style.cssText = 'text-align:center;margin-bottom:4mm';
  header.innerHTML = `
    <div style="font-size:10px;letter-spacing:1px">${DOUBLE}</div>
    <div style="font-weight:bold;font-size:14px;margin:2mm 0;letter-spacing:0.5px">${esc(data.canteen_name)}</div>
    <div style="font-size:10px">${esc(data.branch_name)}</div>
    <div style="font-size:10px;margin-top:2mm">${DOUBLE}</div>
  `;
  el.appendChild(header);

  // --- Info ---
  const info = doc.createElement('div');
  info.style.cssText = 'font-size:10px;margin-bottom:3mm;line-height:1.6';
  info.innerHTML = `
    <div style="display:flex;justify-content:space-between">
      <span>Date: ${esc(data.date)}</span>
      <span>Time: ${esc(data.time)}</span>
    </div>
    <div>Receipt No: ${esc(data.receipt_number)}</div>
    <div>Cashier: ${esc(data.cashier)}</div>
  `;
  el.appendChild(info);

  // --- Single separator ---
  const sep1 = doc.createElement('div');
  sep1.style.cssText = 'font-size:10px;color:#888';
  sep1.textContent = SINGLE;
  el.appendChild(sep1);

  // --- Items table ---
  const table = doc.createElement('table');
  table.style.cssText = 'width:100%;font-size:10px;border-collapse:collapse;margin-top:1mm;margin-bottom:1mm';
  const thead = doc.createElement('thead');
  thead.innerHTML = `<tr><th style="text-align:left">Item</th><th style="text-align:center;width:12%">Qty</th><th style="text-align:right;width:18%">Rate</th><th style="text-align:right;width:22%">Amount</th></tr>`;
  table.appendChild(thead);
  const tbody = doc.createElement('tbody');
  for (const item of data.items) {
    const tr = doc.createElement('tr');
    tr.innerHTML = `
      <td style="padding-top:1mm">${esc(item.name)}</td>
      <td style="text-align:center;padding-top:1mm">${esc(item.quantity)}</td>
      <td style="text-align:right;padding-top:1mm">${esc(padLeft(item.rate, 5))}</td>
      <td style="text-align:right;padding-top:1mm">${esc(padLeft(item.amount, 6))}</td>
    `;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  el.appendChild(table);

  // --- Single separator ---
  const sep2 = doc.createElement('div');
  sep2.style.cssText = 'font-size:10px;color:#888';
  sep2.textContent = SINGLE;
  el.appendChild(sep2);

  // --- Total ---
  const totalWrap = doc.createElement('div');
  totalWrap.style.cssText = 'margin-top:2mm;margin-bottom:2mm';
  totalWrap.innerHTML = `
    <div style="font-size:10px">${DOUBLE}</div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;padding:1.5mm 0">
      <span>TOTAL</span>
      <span>${esc(formatRs(data.total))}</span>
    </div>
    <div style="font-size:10px">${DOUBLE}</div>
  `;
  el.appendChild(totalWrap);

  // --- Payment ---
  const payment = doc.createElement('div');
  payment.style.cssText = 'font-size:10px;margin-top:2mm;line-height:1.6';
  let paymentHtml = `<div>Payment Method: ${esc(data.payment_method)}</div>`;
  if (isCash && data.amount_received !== null) {
    paymentHtml += `
      <div style="display:flex;justify-content:space-between">
        <span>Amount Received:</span>
        <span>${esc(formatRs(data.amount_received))}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span>Change:</span>
        <span>${esc(formatRs(data.change ?? 0))}</span>
      </div>
    `;
  }
  payment.innerHTML = paymentHtml;
  el.appendChild(payment);

  // --- Footer ---
  const footer = doc.createElement('div');
  footer.style.cssText = 'margin-top:4mm';
  footer.innerHTML = `
    <div style="font-size:10px">Operator: ${esc(data.cashier)}</div>
    <div style="text-align:center;margin-top:3mm">
      <div style="font-size:10px;font-weight:bold">Thank you for visiting IDC!</div>
      <div style="font-size:9px;color:#666;margin-top:1mm">Computer-generated receipt</div>
    </div>
    <div style="font-size:10px;text-align:center;margin-top:2mm">${DOUBLE}</div>
  `;
  el.appendChild(footer);
}
