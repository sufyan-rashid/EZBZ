
-- Payment method: the app offers "Bank Transfer" (value 'bank') but the
-- constraint rejected it, so bank-transfer sales failed outright.
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method = any (array['cash','card','bank','online','other']));
alter table public.customer_payments drop constraint customer_payments_payment_method_check;
alter table public.customer_payments add constraint customer_payments_payment_method_check
  check (payment_method = any (array['cash','card','bank','online','other']));

-- Return value applied against what a credit customer owes on an order.
alter table public.orders add column credited_amount numeric(12,2) not null default 0;

alter table public.returns
  add column credit_applied numeric(12,2) not null default 0,
  add column cash_refunded numeric(12,2) not null default 0,
  add column refund_method text not null default 'cash';
update public.returns set cash_refunded = net_amount;

create table public.return_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  return_id uuid not null references public.returns(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index return_credit_allocations_order_idx on public.return_credit_allocations(order_id);
alter table public.return_credit_allocations enable row level security;
create policy "Members can view return credit allocations" on public.return_credit_allocations
  for select using (exists (select 1 from public.business_members bm
    where bm.business_id = return_credit_allocations.business_id and bm.user_id = auth.uid()));
grant select on public.return_credit_allocations to authenticated;

-- Money paid back out: the outflow counterpart to order_payments.
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  return_id uuid references public.returns(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'cash',
  reason text not null check (reason in ('return', 'order_cancelled')),
  refunded_at timestamptz not null default now(),
  refunded_by uuid references auth.users(id)
);
create index refunds_business_date_idx on public.refunds(business_id, refunded_at);
alter table public.refunds enable row level security;
create policy "Members can view their business's refunds" on public.refunds
  for select using (exists (select 1 from public.business_members bm
    where bm.business_id = refunds.business_id and bm.user_id = auth.uid()));
grant select on public.refunds to authenticated;

-- Backfill: every past return was paid out in full, and every cancelled
-- order's collected payments were (implicitly) handed back.
insert into public.refunds (business_id, return_id, customer_id, amount, payment_method, reason, refunded_at, refunded_by)
select business_id, id, customer_id, net_amount, 'cash', 'return', created_at, created_by
from public.returns where net_amount > 0;

insert into public.refunds (business_id, order_id, customer_id, amount, payment_method, reason, refunded_at, refunded_by)
select op.business_id, op.order_id, op.customer_id, sum(op.amount), op.payment_method, 'order_cancelled', o.updated_at, o.cancelled_by
from public.order_payments op join public.orders o on o.id = op.order_id
where o.status = 'cancelled'
group by op.business_id, op.order_id, op.customer_id, op.payment_method, o.updated_at, o.cancelled_by;

-- ---------------------------------------------------------------------------
-- create_return: apply refund to the customer's outstanding balance first,
-- record only the remainder as money paid out.
-- ---------------------------------------------------------------------------
drop function public.create_return(uuid, uuid, jsonb, text, numeric, text, boolean);

create function public.create_return(
  p_business_id uuid, p_customer_id uuid, p_items jsonb, p_deduction_type text,
  p_deduction_value numeric, p_notes text, p_dry_run boolean default false,
  p_refund_method text default 'cash')
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_return_id uuid;
  v_return_number text;
  v_next_seq integer;
  v_gross numeric := 0;
  v_deduction numeric := 0;
  v_net numeric;
  v_item jsonb;
  v_product_id uuid;
  v_product_name text;
  v_quantity numeric;
  v_matched_order_item_id uuid;
  v_unit_price numeric;
  v_unit_cost numeric;
  v_current_stock numeric;
  v_line_items jsonb := '[]'::jsonb;
  v_line_subtotal numeric;
  v_unit_type text;
  v_pack_size numeric;
  v_pack_price numeric;
  v_packs numeric;
  v_loose numeric;
  v_refund_method text := coalesce(nullif(p_refund_method, ''), 'cash');
  v_customer_due numeric := 0;
  v_credit numeric := 0;
  v_cash_refund numeric := 0;
  v_remaining numeric;
  v_apply numeric;
  v_ord record;
begin
  if not has_permission(v_business_id, 'returns', 'add') then
    raise exception 'You do not have permission to process returns';
  end if;

  if v_refund_method not in ('cash', 'card', 'bank', 'online', 'other') then
    raise exception 'Invalid refund method';
  end if;

  if p_customer_id is not null and not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    raise exception 'Invalid customer';
  end if;

  if not p_dry_run then
    update businesses set next_return_number = next_return_number + 1
    where id = v_business_id
    returning next_return_number - 1 into v_next_seq;
    v_return_number := 'RET-' || lpad(v_next_seq::text, 4, '0');
    insert into returns (business_id, customer_id, return_number, notes, created_by)
    values (v_business_id, p_customer_id, v_return_number, p_notes, auth.uid()) returning id into v_return_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    select name into v_product_name from products where id = v_product_id and business_id = v_business_id;
    if v_product_name is null then raise exception 'Invalid product in return'; end if;

    v_matched_order_item_id := null;

    select oi.id, oi.unit_price, oi.unit_cost into v_matched_order_item_id, v_unit_price, v_unit_cost
    from order_items oi
    join orders o on o.id = oi.order_id
    left join (
      select reference_id, sum(quantity) as returned_qty from inventory_transactions
      where type = 'customer_return' and reference_type = 'order_item' group by reference_id
    ) ret on ret.reference_id = oi.id
    where oi.product_id = v_product_id and o.business_id = v_business_id and o.status != 'cancelled'
      and (oi.quantity - coalesce(ret.returned_qty, 0)) >= v_quantity
    order by case when p_customer_id is not null and o.customer_id = p_customer_id then 0 else 1 end, o.created_at desc
    limit 1;

    if v_matched_order_item_id is null then
      select unit_type, pack_size, pack_price, selling_price, cost_price
      into v_unit_type, v_pack_size, v_pack_price, v_unit_price, v_unit_cost
      from products where id = v_product_id;

      if v_unit_type = 'pack' and v_pack_size is not null and v_pack_size > 0 then
        v_packs := floor(v_quantity / v_pack_size + 1e-9);
        v_loose := v_quantity - v_packs * v_pack_size;
        v_line_subtotal := round(v_packs * coalesce(v_pack_price, 0) + v_loose * v_unit_price, 2);
        v_unit_price := case when v_quantity > 0 then round(v_line_subtotal / v_quantity, 6) else v_unit_price end;
      else
        v_line_subtotal := round(v_unit_price * v_quantity, 2);
      end if;
    else
      v_line_subtotal := round(v_unit_price * v_quantity, 2);
    end if;

    v_gross := v_gross + v_line_subtotal;

    v_line_items := v_line_items || jsonb_build_object(
      'product_id', v_product_id, 'product_name', v_product_name, 'quantity', v_quantity,
      'unit_price', v_unit_price, 'subtotal', v_line_subtotal, 'matched_sale', v_matched_order_item_id is not null
    );

    if not p_dry_run then
      insert into return_items (return_id, product_id, order_item_id, quantity, unit_price, unit_cost, subtotal)
      values (v_return_id, v_product_id, v_matched_order_item_id, v_quantity, v_unit_price, v_unit_cost, v_line_subtotal);

      if v_matched_order_item_id is not null then
        update order_items set returned_quantity = returned_quantity + v_quantity where id = v_matched_order_item_id;
      end if;

      select stock_quantity into v_current_stock from products where id = v_product_id;
      update products set stock_quantity = stock_quantity + v_quantity where id = v_product_id;

      insert into inventory_transactions (business_id, product_id, type, quantity, previous_quantity, new_quantity, reason, reference_type, reference_id, created_by)
      values (v_business_id, v_product_id, 'customer_return', v_quantity, v_current_stock, v_current_stock + v_quantity, 'Customer return', 'order_item', v_matched_order_item_id, auth.uid());
    end if;
  end loop;

  if p_deduction_type = 'percentage' then
    v_deduction := round(v_gross * (p_deduction_value / 100), 2);
  else
    v_deduction := round(p_deduction_value, 2);
  end if;
  v_net := round(greatest(v_gross - v_deduction, 0), 2);

  -- A customer who still owes money gets the return value knocked off their
  -- balance first; handing them cash while they owe us would leave the
  -- khata overstated. Only what exceeds their balance is paid out.
  if p_customer_id is not null and v_net > 0 then
    select coalesce(sum(total - amount_paid - credited_amount), 0) into v_customer_due
    from orders
    where business_id = v_business_id and customer_id = p_customer_id and status = 'completed'
      and total - amount_paid - credited_amount > 0;
    v_credit := least(v_net, v_customer_due);
  end if;
  v_cash_refund := v_net - v_credit;

  if not p_dry_run then
    if v_credit > 0 then
      v_remaining := v_credit;
      for v_ord in
        select id, total - amount_paid - credited_amount as due
        from orders
        where business_id = v_business_id and customer_id = p_customer_id and status = 'completed'
          and total - amount_paid - credited_amount > 0
        order by created_at asc
      loop
        exit when v_remaining <= 0;
        v_apply := least(v_remaining, v_ord.due);
        update orders set credited_amount = credited_amount + v_apply, updated_at = now() where id = v_ord.id;
        insert into return_credit_allocations (business_id, return_id, order_id, amount)
        values (v_business_id, v_return_id, v_ord.id, v_apply);
        v_remaining := v_remaining - v_apply;
      end loop;
    end if;

    if v_cash_refund > 0 then
      insert into refunds (business_id, return_id, customer_id, amount, payment_method, reason, refunded_by)
      values (v_business_id, v_return_id, p_customer_id, v_cash_refund, v_refund_method, 'return', auth.uid());
    end if;

    update returns set gross_amount = v_gross, deduction_type = p_deduction_type, deduction_value = p_deduction_value,
      deduction_amount = v_deduction, net_amount = v_net,
      credit_applied = v_credit, cash_refunded = v_cash_refund, refund_method = v_refund_method
    where id = v_return_id;
  end if;

  return jsonb_build_object('return_id', v_return_id, 'return_number', v_return_number, 'items', v_line_items,
    'gross_amount', v_gross, 'deduction_amount', v_deduction, 'net_amount', v_net,
    'customer_due', v_customer_due, 'credit_applied', v_credit, 'cash_refund', v_cash_refund);
end;
$function$;

grant execute on function public.create_return(uuid, uuid, jsonb, text, numeric, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app_cancel_order: record collected payments as refunded; refuse orders
-- that already had items returned (stock/credit would be double-counted).
-- ---------------------------------------------------------------------------
create or replace function public.app_cancel_order(p_order_id uuid, p_reason text default 'Order cancelled')
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid;
  v_status text;
  v_credited numeric;
  v_item record;
begin
  select business_id, status, credited_amount into v_business_id, v_status, v_credited
  from orders where id = p_order_id;

  if v_business_id is null then
    raise exception 'Order not found';
  end if;

  if not has_permission(v_business_id, 'orders', 'delete') then
    raise exception 'Not authorized for this business';
  end if;

  if v_status = 'cancelled' then
    raise exception 'This order is already cancelled';
  end if;

  if exists (select 1 from order_items where order_id = p_order_id and returned_quantity > 0) then
    raise exception 'Some items on this order were already returned. Process a return for the remaining items instead of cancelling.';
  end if;

  if v_credited > 0 then
    raise exception 'A return credit has been applied to this order. Process a return for the remaining items instead of cancelling.';
  end if;

  for v_item in select oi.product_id, oi.quantity from order_items oi where oi.order_id = p_order_id loop
    update products set stock_quantity = stock_quantity + v_item.quantity where id = v_item.product_id;

    insert into inventory_transactions (
      business_id, product_id, type, quantity, previous_quantity, new_quantity, reason, reference_type, reference_id, created_by
    )
    select v_business_id, v_item.product_id, 'return', v_item.quantity,
           p.stock_quantity - v_item.quantity, p.stock_quantity,
           p_reason, 'order', p_order_id, auth.uid()
    from products p where p.id = v_item.product_id;
  end loop;

  insert into refunds (business_id, order_id, customer_id, amount, payment_method, reason, refunded_by)
  select business_id, order_id, customer_id, sum(amount), payment_method, 'order_cancelled', auth.uid()
  from order_payments where order_id = p_order_id
  group by business_id, order_id, customer_id, payment_method
  having sum(amount) > 0;

  update orders set status = 'cancelled', updated_at = now() where id = p_order_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Payments: what's owed now excludes return credit.
-- ---------------------------------------------------------------------------
create or replace function public.app_record_order_payment(p_order_id uuid, p_amount numeric, p_payment_method text default null::text)
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

  v_due := greatest(0, v_order.total - v_order.amount_paid - v_order.credited_amount);
  if round(p_amount, 2) > round(v_due, 2) then
    raise exception 'Amount exceeds the outstanding balance of %', v_due;
  end if;

  update orders set amount_paid = amount_paid + p_amount, updated_at = now() where id = p_order_id;

  insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_by)
  values (v_order.business_id, p_order_id, v_order.customer_id, p_amount, coalesce(p_payment_method, v_order.payment_method, 'cash'), auth.uid());
end;
$function$;

create or replace function public.record_customer_payment(p_customer_id uuid, p_amount numeric, p_payment_method text default 'cash'::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid;
  v_remaining numeric := round(p_amount, 2);
  v_total_due numeric;
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

  select coalesce(sum(total - amount_paid - credited_amount), 0) into v_total_due
  from orders where customer_id = p_customer_id and status = 'completed'
    and total - amount_paid - credited_amount > 0;

  if v_remaining > round(v_total_due, 2) then
    raise exception 'Amount exceeds the outstanding balance of %', v_total_due;
  end if;

  for v_order in
    select id, total - amount_paid - credited_amount as due
    from orders
    where customer_id = p_customer_id and status = 'completed'
      and total - amount_paid - credited_amount > 0
    order by created_at asc
  loop
    exit when v_remaining <= 0;
    v_apply := least(v_remaining, v_order.due);
    update orders set amount_paid = amount_paid + v_apply, updated_at = now() where id = v_order.id;
    insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_by)
    values (v_business_id, v_order.id, p_customer_id, v_apply, coalesce(p_payment_method, 'cash'), auth.uid());
    v_remaining := v_remaining - v_apply;
  end loop;
end;
$function$;

create or replace function public.get_customers_with_balance(p_business_id uuid)
 returns table(id uuid, name text, phone text, total_purchases numeric, total_paid numeric, total_due numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_business_id uuid := p_business_id;
begin
  if not has_permission(v_business_id, 'customers', 'view') then
    raise exception 'You do not have permission to view customers';
  end if;

  return query
  select c.id, c.name, c.phone,
    coalesce(o.total_purchases, 0) as total_purchases,
    coalesce(o.total_paid_orders, 0) + coalesce(p.total_extra_payments, 0) as total_paid,
    greatest(coalesce(o.total_purchases, 0)
      - coalesce(o.total_credited, 0)
      - (coalesce(o.total_paid_orders, 0) + coalesce(p.total_extra_payments, 0)), 0) as total_due
  from customers c
  left join (
    select customer_id, sum(total) as total_purchases, sum(amount_paid) as total_paid_orders, sum(credited_amount) as total_credited
    from orders where business_id = v_business_id and status = 'completed' group by customer_id
  ) o on o.customer_id = c.id
  left join (
    select customer_id, sum(amount) as total_extra_payments from customer_payments where business_id = v_business_id group by customer_id
  ) p on p.customer_id = c.id
  where c.business_id = v_business_id
  order by c.name;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Dashboard / report / chart: revenue nets what was actually refunded or
-- credited (net_amount, not gross — a restocking deduction is kept income),
-- outstanding excludes return credit, payment breakdown is money in minus
-- money out per method.
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_stats(p_business_id uuid)
 returns table(today_sales numeric, today_orders integer, today_expenses numeric, today_profit numeric, total_outstanding numeric, payment_breakdown jsonb)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_revenue numeric := 0; v_cogs numeric := 0; v_expenses numeric := 0; v_order_count integer := 0;
  v_returns_revenue numeric := 0; v_returns_cogs numeric := 0; v_outstanding numeric := 0;
  v_breakdown jsonb;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;

  select coalesce(sum(o.total), 0), count(*) into v_revenue, v_order_count from orders o
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(net_amount), 0) into v_returns_revenue from returns
  where business_id = v_business_id and (created_at at time zone 'Asia/Karachi')::date = v_today;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at at time zone 'Asia/Karachi')::date = v_today;
  v_revenue := v_revenue - v_returns_revenue;
  v_cogs := v_cogs - v_returns_cogs;
  select coalesce(sum(amount), 0) into v_expenses from expenses where business_id = v_business_id and date = v_today;
  select coalesce(sum(greatest(total - amount_paid - credited_amount, 0)), 0) into v_outstanding
  from orders where business_id = v_business_id and status = 'completed';

  select coalesce(jsonb_object_agg(payment_method, total), '{}'::jsonb) into v_breakdown from (
    select payment_method, sum(amt) as total from (
      select payment_method, amount as amt from order_payments
      where business_id = v_business_id and (received_at at time zone 'Asia/Karachi')::date = v_today
      union all
      select payment_method, -amount from refunds
      where business_id = v_business_id and (refunded_at at time zone 'Asia/Karachi')::date = v_today
    ) m group by payment_method
  ) t;

  return query select v_revenue, v_order_count, v_expenses, (v_revenue - v_cogs - v_expenses), v_outstanding, v_breakdown;
end;
$function$;

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
  where business_id = v_business_id and (created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date and status = 'completed';
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date and o.status = 'completed';
  select coalesce(sum(net_amount), 0) into v_returns_revenue from returns
  where business_id = v_business_id and (created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date;
  v_revenue := v_total_sales - v_returns_revenue;
  v_cogs := v_cogs - v_returns_cogs;
  v_avg_order := case when v_order_count > 0 then v_total_sales / v_order_count else 0 end;
  v_gross_profit := v_revenue - v_cogs;
  select coalesce(sum(amount), 0) into v_expenses from expenses where business_id = v_business_id and date between p_start_date and p_end_date;
  v_net_profit := v_gross_profit - v_expenses;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_products from (
    select p.name, sum(oi.quantity) as quantity_sold, sum(oi.subtotal) as revenue
    from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
    where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date and o.status = 'completed'
    group by p.name order by quantity_sold desc limit 5
  ) t;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_expense_categories from (
    select category, sum(amount) as total from expenses where business_id = v_business_id and date between p_start_date and p_end_date
    group by category order by total desc
  ) t;
  select coalesce(jsonb_object_agg(payment_method, total), '{}'::jsonb) into v_payment_breakdown from (
    select payment_method, sum(amt) as total from (
      select payment_method, amount as amt from order_payments
      where business_id = v_business_id and (received_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date
      union all
      select payment_method, -amount from refunds
      where business_id = v_business_id and (refunded_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date
    ) m group by payment_method
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

create or replace function public.get_sales_chart(p_business_id uuid, p_days integer default 7)
 returns table(day date, total numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;
  return query
  select d::date as day,
    coalesce(sum(o.total), 0) - coalesce((select sum(r.net_amount) from returns r where r.business_id = v_business_id and (r.created_at at time zone 'Asia/Karachi')::date = d::date), 0) as total
  from generate_series(v_today - (p_days - 1), v_today, interval '1 day') d
  left join orders o on o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = d::date and o.status = 'completed'
  group by d order by d;
end;
$function$;
