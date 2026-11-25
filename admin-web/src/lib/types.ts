export type BusinessRow = {
  business_id: string;
  business_name: string;
  business_phone: string | null;
  category: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  plan: string | null;
  status: string | null;
  amount: number | null;
  max_users: number | null;
  start_date: string | null;
  expiry_date: string | null;
  member_count: number;
  order_count: number;
  orders_last_30d: number;
  last_order_at: string | null;
  total_paid: number;
  last_payment_at: string | null;
};

export type PaymentRow = {
  id: string;
  business_id: string;
  business_name: string;
  amount: number;
  months: number;
  method: string | null;
  reference: string | null;
  new_expiry_date: string;
  created_at: string;
};
