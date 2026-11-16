-- Fix: create_return inserted return_items and adjusted stock, but never
-- updated order_items.returned_quantity on the matched order item. The
-- order detail screen reads that column to show "N returned" and to net
-- the item's subtotal, so a fully-returned item still displayed as if
-- nothing had been returned.
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

-- Backfill: recompute returned_quantity for existing order_items from the
-- inventory_transactions history, since past returns (including the one
-- just processed in this QA session) never updated the column.
update order_items oi
set returned_quantity = coalesce(ret.returned_qty, 0)
from (
  select reference_id, sum(quantity) as returned_qty
  from inventory_transactions
  where type = 'customer_return' and reference_type = 'order_item' and reference_id is not null
  group by reference_id
) ret
where ret.reference_id = oi.id and oi.returned_quantity is distinct from coalesce(ret.returned_qty, 0);
