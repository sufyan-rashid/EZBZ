-- Fix: order/return numbers were generated via
-- `select max(...)+1 from orders` — two concurrent create_order calls for
-- the same business (e.g. two cashiers who were both offline and save at
-- the same moment the connection comes back) can both read the same max
-- before either commits, then race to insert the same number. The
-- UNIQUE(business_id, order_number) constraint already stops that from
-- silently corrupting data, but the loser of the race gets a raw
-- "duplicate key" database error and their save fails outright.
--
-- Fix: a per-business running counter, incremented via a single atomic
-- UPDATE. Postgres row-locks the business row for that update, so a
-- second concurrent call simply waits a few milliseconds for the first to
-- finish instead of racing it — every order/return gets a guaranteed
-- unique number with no retry logic needed anywhere.

alter table public.businesses add column next_order_number integer not null default 1;
alter table public.businesses add column next_return_number integer not null default 1;

update businesses b
set next_order_number = coalesce((
  select max(substring(order_number from '\d+')::integer) + 1
  from orders where business_id = b.id
), 1);

update businesses b
set next_return_number = coalesce((
  select max(substring(return_number from '\d+')::integer) + 1
  from returns where business_id = b.id
), 1);

-- create_order: atomic counter increment instead of select-max.
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

  update businesses set next_order_number = next_order_number + 1
  where id = v_business_id
  returning next_order_number - 1 into v_next_seq;
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

-- create_return: same atomic counter fix.
create or replace function public.create_return(
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
