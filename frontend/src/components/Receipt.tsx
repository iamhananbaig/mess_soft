import { formatPKR } from '@/lib/format';
import type { ReceiptData } from '@/types/receipt';

export type { ReceiptData } from '@/types/receipt';

const DOUBLE = '========================================';
const SINGLE = '----------------------------------------';

export function Receipt({ data, variant = 'original' }: { data: ReceiptData; variant?: 'original' | 'duplicate' }) {
  const isCash = data.payment_method === 'Cash';

  return (
    <div className="receipt" style={{ width: '80mm', fontFamily: 'monospace', padding: '4mm', fontSize: '11px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
        <div style={{ fontSize: '10px' }}>{DOUBLE}</div>
        <div style={{ fontWeight: 'bold', fontSize: '14px', margin: '2mm 0', letterSpacing: '0.5px' }}>
          *** {data.canteen_name} ***
        </div>
        <div style={{ fontSize: '10px' }}>{DOUBLE}</div>
      </div>

      {/* Info */}
      <div style={{ fontSize: '10px', marginBottom: '3mm', lineHeight: '1.6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>#{data.receipt_number}</span>
          <span>{data.date}  {data.time}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Cashier: {data.cashier}</span>
          <span style={{ fontWeight: 'bold' }}>{variant === 'duplicate' ? 'DUPLICATE' : 'ORIGINAL'}</span>
        </div>
      </div>

      {/* Separator */}
      <div style={{ fontSize: '10px', color: '#888' }}>{SINGLE}</div>

      {/* Items */}
      <div style={{ fontSize: '10px', marginBottom: '1mm', lineHeight: '1.6' }}>
        <div style={{ display: 'flex', fontWeight: 'bold' }}>
          <span style={{ flex: 1 }}>Item</span>
          <span style={{ width: '30%', textAlign: 'right' }}>Qty x Rate</span>
          <span style={{ width: '22%', textAlign: 'right' }}>= Amt</span>
        </div>
        <div style={{ fontSize: '10px', color: '#888', margin: '1mm 0' }}>{SINGLE}</div>
        {data.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', lineHeight: '1.6' }}>
            <span style={{ flex: 1 }}>{item.name}</span>
            <span style={{ width: '30%', textAlign: 'right' }}>{item.quantity} x {item.rate}</span>
            <span style={{ width: '22%', textAlign: 'right' }}>{item.amount}</span>
          </div>
        ))}
      </div>

      {/* Separator */}
      <div style={{ fontSize: '10px', color: '#888' }}>{SINGLE}</div>

      {/* Total */}
      <div style={{ margin: '2mm 0', padding: '1.5mm 0' }}>
        <div style={{ fontSize: '10px' }}>{DOUBLE}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', padding: '1.5mm 0' }}>
          <span>TOTAL</span>
          <span>{formatPKR(data.total, { receipt: true })}</span>
        </div>
        <div style={{ fontSize: '10px' }}>{DOUBLE}</div>
      </div>

      {/* Payment */}
      <div style={{ fontSize: '10px', marginTop: '2mm', lineHeight: '1.6' }}>
        {isCash && data.amount_received !== null ? (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Paid: {formatPKR(data.amount_received, { receipt: true })}</span>
            <span>Change: {formatPKR(data.change ?? 0, { receipt: true })}</span>
          </div>
        ) : (
          <div>Payment: {data.payment_method}</div>
        )}
      </div>

      {/* Separator */}
      <div style={{ fontSize: '10px', color: '#888', marginTop: '3mm' }}>{SINGLE}</div>

      {/* Footer */}
      <div style={{ marginTop: '3mm', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold' }}>Thank you for visiting!</div>
        <div style={{ fontSize: '10px', marginTop: '2mm', letterSpacing: '1px' }}>{DOUBLE}</div>
      </div>
    </div>
  );
}
