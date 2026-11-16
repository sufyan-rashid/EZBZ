-- Finance audit fix: "Payments by Method" was summing each order's full
-- total, not what was actually collected (orders.amount_paid). A credit/
-- partial-payment order inflated its payment-method bucket by the unpaid
-- portion too — e.g. a Rs.50 order with only Rs.20 paid in cash showed as
-- "Rs.50 cash collected" on the dashboard. There was also no ledger of
-- individual payment events, so a due paid off today on an order created
-- days ago never showed up in "today's payments" at all, and an order's
-- top-up payments couldn't be attributed to the method actually used.
--
-- Fix: a proper per-payment-event ledger. Every payment (full or partial,
-- at order creation or collected later) gets its own dated row. Dashboard
-- and report "payments by method" now read from this ledger filtered by
-- the date the money actually came in, not by when the order was created.

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  payment_method text not null default 'cash',
  received_at timestamptz not null default now(),
  received_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index order_payments_business_date_idx on public.order_payments (business_id, received_at);
create index order_payments_order_idx on public.order_payments (order_id);
create index order_payments_customer_idx on public.order_payments (customer_id);

alter table public.order_payments enable row level security;
create policy "Members can view their business's order payments"
  on public.order_payments for select
  using (exists (select 1 from business_members where business_id = order_payments.business_id and user_id = auth.uid()));
grant select on public.order_payments to authenticated;

-- Backfill: one retroactive row per existing paid order, dated at the
-- order's own created_at and using its recorded payment_method. This is a
-- best-effort reconstruction (a historical order that actually received
-- several separate top-ups over time collapses into one row here) but it
-- is strictly better than the current total blank, and every future
-- payment from this point on is recorded precisely as it happens.
insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_at, received_by)
select business_id, id, customer_id, amount_paid, payment_method, created_at, created_by
from orders
where status = 'completed' and amount_paid > 0;
