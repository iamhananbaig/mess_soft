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
