-- Fix: 8 RPC functions resolved "the user's business" via
-- `business_members where user_id = auth.uid() limit 1`, which is wrong for
-- any user who is a member of more than one business (multi-business owners)
-- -- it picks an arbitrary membership row, not the business currently active
-- in the client. This silently wrote orders/returns/invites to the wrong
-- business and read dashboard/report/customer data for the wrong business.
-- Fix: accept p_business_id from the client (which already tracks the
-- active business) and verify membership/permission server-side instead of
-- guessing.

-- 1. create_order
drop function if exists public.create_order(uuid, text, numeric, text, jsonb, numeric, text);
create function public.create_order(
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

  insert into orders (business_id, customer_id, order_number, status, subtotal, discount_type, discount_value, discount, total, notes, amount_paid, payment_method)
  values (v_business_id, p_customer_id, v_order_number, 'completed', v_subtotal, p_discount_type, p_discount_value, v_discount, v_total, p_notes, v_amount_paid, coalesce(p_payment_method, 'cash'))
  returning id into v_order_id;

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

-- 2. create_return
drop function if exists public.create_return(uuid, jsonb, text, numeric, text, boolean);
create function public.create_return(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_deduction_type text,
  p_deduction_value numeric,
  p_notes text,
  p_dry_run boolean default false
) returns jsonb
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
begin
  if not has_permission(v_business_id, 'returns', 'add') then
    raise exception 'You do not have permission to process returns';
  end if;

  if p_customer_id is not null and not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    raise exception 'Invalid customer';
  end if;

  if not p_dry_run then
    select coalesce(max(substring(return_number from '\d+')::integer), 0) + 1 into v_next_seq from returns where business_id = v_business_id;
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
      select selling_price, cost_price into v_unit_price, v_unit_cost from products where id = v_product_id;
    end if;

    v_gross := v_gross + (v_unit_price * v_quantity);

    v_line_items := v_line_items || jsonb_build_object(
      'product_id', v_product_id, 'product_name', v_product_name, 'quantity', v_quantity,
      'unit_price', v_unit_price, 'subtotal', v_unit_price * v_quantity, 'matched_sale', v_matched_order_item_id is not null
    );

    if not p_dry_run then
      insert into return_items (return_id, product_id, order_item_id, quantity, unit_price, unit_cost, subtotal)
      values (v_return_id, v_product_id, v_matched_order_item_id, v_quantity, v_unit_price, v_unit_cost, v_unit_price * v_quantity);

      select stock_quantity into v_current_stock from products where id = v_product_id;
      update products set stock_quantity = stock_quantity + v_quantity where id = v_product_id;

      insert into inventory_transactions (business_id, product_id, type, quantity, previous_quantity, new_quantity, reason, reference_type, reference_id, created_by)
      values (v_business_id, v_product_id, 'customer_return', v_quantity, v_current_stock, v_current_stock + v_quantity, 'Customer return', 'order_item', v_matched_order_item_id, auth.uid());
    end if;
  end loop;

  if p_deduction_type = 'percentage' then
    v_deduction := round(v_gross * (p_deduction_value / 100), 2);
  else
    v_deduction := p_deduction_value;
  end if;
  v_net := greatest(v_gross - v_deduction, 0);

  if not p_dry_run then
    update returns set gross_amount = v_gross, deduction_type = p_deduction_type, deduction_value = p_deduction_value,
      deduction_amount = v_deduction, net_amount = v_net where id = v_return_id;
  end if;

  return jsonb_build_object('return_id', v_return_id, 'return_number', v_return_number, 'items', v_line_items,
    'gross_amount', v_gross, 'deduction_amount', v_deduction, 'net_amount', v_net);
end;
$function$;

-- 3. get_customers_with_balance
drop function if exists public.get_customers_with_balance();
create function public.get_customers_with_balance(p_business_id uuid)
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
    greatest(coalesce(o.total_purchases, 0) - (coalesce(o.total_paid_orders, 0) + coalesce(p.total_extra_payments, 0)), 0) as total_due
  from customers c
  left join (
    select customer_id, sum(total) as total_purchases, sum(amount_paid) as total_paid_orders
    from orders where business_id = v_business_id and status = 'completed' group by customer_id
  ) o on o.customer_id = c.id
  left join (
    select customer_id, sum(amount) as total_extra_payments from customer_payments where business_id = v_business_id group by customer_id
  ) p on p.customer_id = c.id
  where c.business_id = v_business_id
  order by c.name;
end;
$function$;

-- 4. get_dashboard_stats
drop function if exists public.get_dashboard_stats();
create function public.get_dashboard_stats(p_business_id uuid)
returns table(today_sales numeric, today_orders integer, today_expenses numeric, today_profit numeric, total_outstanding numeric, payment_breakdown jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_revenue numeric := 0; v_cogs numeric := 0; v_expenses numeric := 0; v_order_count integer := 0;
  v_returns_revenue numeric := 0; v_returns_cogs numeric := 0; v_outstanding numeric := 0; v_total_payments numeric := 0;
  v_breakdown jsonb;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;

  select coalesce(sum(o.total), 0) into v_revenue from orders o where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select count(*) into v_order_count from orders o where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today;
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(gross_amount), 0) into v_returns_revenue from returns where business_id = v_business_id and (created_at AT TIME ZONE 'Asia/Karachi')::date = v_today;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at AT TIME ZONE 'Asia/Karachi')::date = v_today;
  v_revenue := v_revenue - v_returns_revenue;
  v_cogs := v_cogs - v_returns_cogs;
  select coalesce(sum(amount), 0) into v_expenses from expenses where business_id = v_business_id and date = v_today;
  select coalesce(sum(total - amount_paid), 0) into v_outstanding from orders where business_id = v_business_id and status = 'completed';
  select coalesce(sum(amount), 0) into v_total_payments from customer_payments where business_id = v_business_id;
  v_outstanding := greatest(v_outstanding - v_total_payments, 0);
  select coalesce(jsonb_object_agg(payment_method, total), '{}'::jsonb) into v_breakdown from (
    select payment_method, sum(total) as total from orders
    where business_id = v_business_id and (created_at AT TIME ZONE 'Asia/Karachi')::date = v_today and status = 'completed' group by payment_method
  ) t;

  return query select v_revenue, v_order_count, v_expenses, (v_revenue - v_cogs - v_expenses), v_outstanding, v_breakdown;
end;
$function$;

-- 5. get_report
drop function if exists public.get_report(date, date);
create function public.get_report(p_business_id uuid, p_start_date date, p_end_date date)
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
    select payment_method, sum(total) as total from orders
    where business_id = v_business_id and (created_at AT TIME ZONE 'Asia/Karachi')::date between p_start_date and p_end_date and status = 'completed' group by payment_method
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

-- 6. get_sales_chart
drop function if exists public.get_sales_chart(integer);
create function public.get_sales_chart(p_business_id uuid, p_days integer default 7)
returns table(day date, total numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;
  return query
  select d::date as day,
    coalesce(sum(o.total), 0) - coalesce((select sum(r.gross_amount) from returns r where r.business_id = v_business_id and (r.created_at AT TIME ZONE 'Asia/Karachi')::date = d::date), 0) as total
  from generate_series(v_today - (p_days - 1), v_today, interval '1 day') d
  left join orders o on o.business_id = v_business_id and (o.created_at AT TIME ZONE 'Asia/Karachi')::date = d::date and o.status = 'completed'
  group by d order by d;
end;
$function$;

-- 7. activate_test_subscription
drop function if exists public.activate_test_subscription(integer);
create function public.activate_test_subscription(p_business_id uuid, p_days integer default 30)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from business_members where business_id = v_business_id and user_id = auth.uid()) then
    raise exception 'You are not a member of this business';
  end if;

  update subscriptions
  set status = 'active', start_date = now(), expiry_date = now() + (p_days || ' days')::interval, updated_at = now()
  where business_id = v_business_id;
end;
$function$;

-- 8. invite_team_member
drop function if exists public.invite_team_member(text, text, jsonb);
create function public.invite_team_member(p_business_id uuid, p_email text, p_role_label text, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_max_users integer;
  v_current_count integer;
begin
  if not has_permission(v_business_id, 'team', 'add') then
    raise exception 'You do not have permission to manage the team';
  end if;

  select max_users into v_max_users from subscriptions where business_id = v_business_id;
  select count(*) into v_current_count from business_members where business_id = v_business_id;
  v_current_count := v_current_count + (select count(*) from business_invitations where business_id = v_business_id and status = 'pending');

  if v_current_count >= v_max_users then raise exception 'User limit reached for your plan'; end if;
  if exists (select 1 from business_invitations where business_id = v_business_id and lower(email) = lower(p_email) and status = 'pending') then
    raise exception 'An invitation for this email is already pending';
  end if;

  insert into business_invitations (business_id, email, role, permissions, invited_by)
  values (v_business_id, lower(trim(p_email)), coalesce(nullif(p_role_label, ''), 'Team Member'), p_permissions, auth.uid());
end;
$function$;
