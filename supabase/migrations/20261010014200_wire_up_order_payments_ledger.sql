-- 1. create_order: log the initial payment (if any) into the ledger, and
-- enforce server-side that a walk-in (no customer) order can't be created
-- with an unpaid balance — previously only the client UI blocked this,
-- which would have let an uncollectible "phantom" receivable (owed by no
-- one in particular) slip into Outstanding Receivables if ever called any
-- other way.
create or replace function public.create_order(
  p_business_id uuid,
  p_customer_id uuid,
  p_discount_type text,
  p_discount_value numeric,
  p_notes text,
  p_items jsonb,
  p_amount_paid numeric default null,
  p_payment_method text default 'cash'
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_order_id uuid;
  v_order_number text;
  v_next_seq integer;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_amount_paid numeric;
  v_item jsonb;
  v_product record;
  v_unit_price numeric;
begin
  if not exists (select 1 from business_members where business_id = v_business_id and user_id = auth.uid()) then
    raise exception 'You are not a member of this business';
  end if;

  if p_customer_id is not null and not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    raise exception 'Invalid customer';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from products where id = (v_item->>'product_id')::uuid and business_id = v_business_id) then
      raise exception 'Invalid product in order';
    end if;
  end loop;

  select coalesce(max(substring(order_number from '\d+')::integer), 0) + 1 into v_next_seq from orders where business_id = v_business_id;
  v_order_number := 'ORD-' || lpad(v_next_seq::text, 4, '0');

  for v_item in select * from jsonb_array_elements(p_items) loop
    select selling_price into v_product from products where id = (v_item->>'product_id')::uuid;
    v_unit_price := coalesce((v_item->>'unit_price_override')::numeric, v_product.selling_price);
    v_subtotal := v_subtotal + (v_unit_price * (v_item->>'quantity')::numeric);
  end loop;

  if p_discount_type = 'percentage' then
    v_discount := round(v_subtotal * (p_discount_value / 100), 2);
  else
    v_discount := p_discount_value;
  end if;

  v_total := greatest(v_subtotal - v_discount, 0);
  v_amount_paid := coalesce(p_amount_paid, v_total);

  if p_customer_id is null and v_amount_paid < v_total then
    raise exception 'Walk-in orders must be paid in full';
  end if;

  insert into orders (business_id, customer_id, order_number, status, subtotal, discount_type, discount_value, discount, total, notes, amount_paid, payment_method)
  values (v_business_id, p_customer_id, v_order_number, 'completed', v_subtotal, p_discount_type, p_discount_value, v_discount, v_total, p_notes, v_amount_paid, coalesce(p_payment_method, 'cash'))
  returning id into v_order_id;

  if v_amount_paid > 0 then
    insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_by)
    values (v_business_id, v_order_id, p_customer_id, v_amount_paid, coalesce(p_payment_method, 'cash'), auth.uid());
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select selling_price, cost_price, stock_quantity into v_product from products where id = (v_item->>'product_id')::uuid;
    v_unit_price := coalesce((v_item->>'unit_price_override')::numeric, v_product.selling_price);

    insert into order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal)
    values (v_order_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::numeric, v_unit_price, v_product.cost_price, v_unit_price * (v_item->>'quantity')::numeric);

    update products set stock_quantity = stock_quantity - (v_item->>'quantity')::numeric where id = (v_item->>'product_id')::uuid;

    insert into inventory_transactions (business_id, product_id, type, quantity, previous_quantity, new_quantity, reason, reference_type, reference_id, created_by)
    values (v_business_id, (v_item->>'product_id')::uuid, 'sale', -(v_item->>'quantity')::numeric,
            v_product.stock_quantity, v_product.stock_quantity - (v_item->>'quantity')::numeric, 'Order sale', 'order', v_order_id, auth.uid());
  end loop;

  return v_order_id;
end;
$function$;

-- 2. app_record_order_payment: log the top-up payment into the ledger too,
-- with its own method (falls back to the order's original method, then
-- cash, if the caller doesn't specify one).
drop function if exists public.app_record_order_payment(uuid, numeric);
create function public.app_record_order_payment(p_order_id uuid, p_amount numeric, p_payment_method text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order record;
  v_due numeric;
begin
  select * into v_order from orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if not has_permission(v_order.business_id, 'orders', 'edit') then
    raise exception 'You do not have permission to record payments on orders';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cannot record payment on a cancelled order';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0';
  end if;

  v_due := greatest(0, v_order.total - v_order.amount_paid);
  if p_amount > v_due then
    raise exception 'Amount exceeds the outstanding balance of %', v_due;
  end if;

  update orders set amount_paid = amount_paid + p_amount, updated_at = now() where id = p_order_id;

  insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_by)
  values (v_order.business_id, p_order_id, v_order.customer_id, p_amount, coalesce(p_payment_method, v_order.payment_method, 'cash'), auth.uid());
end;
$function$;

-- 3. record_customer_payment: same, one ledger row per order the payment
-- actually gets applied to (a single payment can settle several orders).
drop function if exists public.record_customer_payment(uuid, numeric);
create function public.record_customer_payment(p_customer_id uuid, p_amount numeric, p_payment_method text default 'cash')
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid;
  v_remaining numeric := p_amount;
  v_order record;
  v_apply numeric;
begin
  select business_id into v_business_id from customers where id = p_customer_id;

  if v_business_id is null then
    raise exception 'Customer not found';
  end if;

  if not has_permission(v_business_id, 'orders', 'edit') then
    raise exception 'You do not have permission to record payments';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  for v_order in
    select id, total, amount_paid
    from orders
    where customer_id = p_customer_id
      and status = 'completed'
      and amount_paid < total
    order by created_at asc
  loop
    exit when v_remaining <= 0;
    v_apply := least(v_remaining, v_order.total - v_order.amount_paid);
    update orders set amount_paid = amount_paid + v_apply, updated_at = now() where id = v_order.id;
    insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_by)
    values (v_business_id, v_order.id, p_customer_id, v_apply, coalesce(p_payment_method, 'cash'), auth.uid());
    v_remaining := v_remaining - v_apply;
  end loop;
end;
$function$;

-- 4. get_dashboard_stats: payment_breakdown now reflects money actually
-- received today (from the ledger, by its own received_at), not each
-- order's full total grouped by whatever method it was created with.
-- today_orders now also excludes cancelled orders, consistent with
-- today_sales, so the two numbers on the dashboard agree with each other.
create or replace function public.get_dashboard_stats(p_business_id uuid)
returns table(today_sales numeric, today_orders integer, today_expenses numeric, today_profit numeric, total_outstanding numeric, payment_breakdown jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_revenue numeric := 0; v_cogs numeric := 0; v_expenses numeric := 0; v_order_count integer := 0;
  v_returns_revenue numeric := 0; v_returns_cogs numeric := 0; v_outstanding numeric := 0;
  v_breakdown jsonb;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;

  select coalesce(sum(o.total), 0) into v_revenue from orders o where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select count(*) into v_order_count from orders o where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(gross_amount), 0) into v_returns_revenue from returns where business_id = v_business_id and (created_at AT TIME ZONE 'Asia/Karachi')::date = v_today;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today;
  v_revenue := v_revenue - v_returns_revenue;
  v_cogs := v_cogs - v_returns_cogs;
  select coalesce(sum(amount), 0) into v_expenses from expenses where business_id = v_business_id and date = v_today;
  select coalesce(sum(total - amount_paid), 0) into v_outstanding from orders where business_id = v_business_id and status = 'completed';
  select coalesce(jsonb_object_agg(payment_method, total), '{}'::jsonb) into v_breakdown from (
    select payment_method, sum(amount) as total from order_payments
    where business_id = v_business_id and (received_at AT TIME ZONE 'Asia/Karachi')::date = v_today
    group by payment_method
  ) t;

  return query select v_revenue, v_order_count, v_expenses, (v_revenue - v_cogs - v_expenses), v_outstanding, v_breakdown;
end;
$function$;

-- 5. get_report: same payment_breakdown fix, scoped to the report's date
-- range by when the money was actually received.
create or replace function public.get_report(p_business_id uuid, p_start_date date, p_end_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id; v_result jsonb; v_total_sales numeric := 0; v_order_count integer := 0; v_avg_order numeric := 0;
  v_revenue numeric := 0; v_cogs numeric := 0; v_gross_profit numeric := 0; v_expenses numeric := 0; v_net_profit numeric := 0;
  v_returns_revenue numeric := 0; v_returns_cogs numeric := 0; v_top_products jsonb; v_expense_categories jsonb; v_payment_breakdown jsonb;
begin
  if not has_permission(v_business_id, 'reports', 'view') then
    raise exception 'You do not have permission to view reports';
  end if;

  select coalesce(sum(total), 0), count(*) into v_total_sales, v_order_count from orders
  where business_id = v_business_id and (created_at AT TIME ZONE 'Asia/Karachi')::date between p_start_date and p_end_date and status = 'completed';
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date between p_start_date and p_end_date and o.status = 'completed';
  select coalesce(sum(gross_amount), 0) into v_returns_revenue from returns where business_id = v_business_id and (created_at AT TIME ZONE 'Asia/Karachi')::date between p_start_date and p_end_date;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at AT TIME ZONE 'Asia/Karachi')::date between p_start_date and p_end_date;
  v_revenue := v_total_sales - v_returns_revenue;
  v_cogs := v_cogs - v_returns_cogs;
  v_avg_order := case when v_order_count > 0 then v_total_sales / v_order_count else 0 end;
  v_gross_profit := v_revenue - v_cogs;
  select coalesce(sum(amount), 0) into v_expenses from expenses where business_id = v_business_id and date between p_start_date and p_end_date;
  v_net_profit := v_gross_profit - v_expenses;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_products from (
    select p.name, sum(oi.quantity) as quantity_sold, sum(oi.subtotal) as revenue
    from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
    where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date between p_start_date and p_end_date and o.status = 'completed'
    group by p.name order by quantity_sold desc limit 5
  ) t;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_expense_categories from (
    select category, sum(amount) as total from expenses where business_id = v_business_id and date between p_start_date and p_end_date
    group by category order by total desc
  ) t;
  select coalesce(jsonb_object_agg(payment_method, total), '{}'::jsonb) into v_payment_breakdown from (
    select payment_method, sum(amount) as total from order_payments
    where business_id = v_business_id and (received_at AT TIME ZONE 'Asia/Karachi')::date between p_start_date and p_end_date
    group by payment_method
  ) t;

  v_result := jsonb_build_object(
    'total_sales', v_revenue, 'order_count', v_order_count, 'avg_order_value', v_avg_order,
    'revenue', v_revenue, 'cogs', v_cogs, 'gross_profit', v_gross_profit,
    'expenses', v_expenses, 'net_profit', v_net_profit,
    'top_products', v_top_products, 'expense_categories', v_expense_categories, 'payment_breakdown', v_payment_breakdown
  );
  return v_result;
end;
$function$;
