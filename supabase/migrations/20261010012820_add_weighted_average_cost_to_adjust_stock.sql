-- Weighted-average costing: when stock is added back via a restock, the
-- shop owner can now record what the whole batch actually cost. We fold
-- that into the product's existing cost_price using a weighted average
-- ((old_stock * old_cost) + total_cost) / new_stock, so cost_price (and
-- every profit/COGS figure built on it, since order_items snapshots it at
-- sale time) tracks the real blended cost of what's on the shelf instead
-- of staying frozen at whatever price was typed in once when the product
-- was first created. p_total_cost is optional and only applies on actual
-- additions (p_quantity_change > 0) — removals/corrections never touch cost.
drop function if exists public.adjust_stock(uuid, numeric, text);
create function public.adjust_stock(
  p_product_id uuid,
  p_quantity_change numeric,
  p_reason text,
  p_total_cost numeric default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business_id uuid;
  v_current_stock numeric;
  v_new_stock numeric;
  v_current_cost numeric;
  v_new_cost numeric;
begin
  select business_id, stock_quantity, cost_price into v_business_id, v_current_stock, v_current_cost
  from products where id = p_product_id;
  if v_business_id is null then raise exception 'Product not found'; end if;

  if not exists (select 1 from business_members where business_id = v_business_id and user_id = auth.uid()) then
    raise exception 'Not authorized for this business';
  end if;

  v_new_stock := v_current_stock + p_quantity_change;
  if v_new_stock < 0 then raise exception 'Stock cannot go below zero'; end if;

  if p_quantity_change > 0 and p_total_cost is not null and p_total_cost >= 0 and v_new_stock > 0 then
    v_new_cost := ((v_current_stock * v_current_cost) + p_total_cost) / v_new_stock;
    update products set stock_quantity = v_new_stock, cost_price = v_new_cost, updated_at = now() where id = p_product_id;
  else
    update products set stock_quantity = v_new_stock, updated_at = now() where id = p_product_id;
  end if;

  insert into inventory_transactions (business_id, product_id, type, quantity, previous_quantity, new_quantity, reason, created_by)
  values (v_business_id, p_product_id, 'manual_adjustment', p_quantity_change, v_current_stock, v_new_stock, p_reason, auth.uid());
end;
$function$;
