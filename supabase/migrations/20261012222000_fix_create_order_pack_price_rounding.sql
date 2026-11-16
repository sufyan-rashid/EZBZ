
CREATE OR REPLACE FUNCTION public.create_order(p_business_id uuid, p_customer_id uuid, p_discount_type text, p_discount_value numeric, p_notes text, p_items jsonb, p_amount_paid numeric DEFAULT NULL::numeric, p_payment_method text DEFAULT 'cash'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_line_subtotal numeric;
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
    -- unit_price_override for pack-type lines is a client-side division
    -- (line subtotal / quantity) that can carry sub-paisa floating-point
    -- noise; rounding each line to money precision before summing keeps
    -- the server's total matching what the client showed and charged.
    v_subtotal := v_subtotal + round(v_unit_price * (v_item->>'quantity')::numeric, 2);
  end loop;

  if p_discount_type = 'percentage' then
    v_discount := round(v_subtotal * (p_discount_value / 100), 2);
  else
    v_discount := p_discount_value;
  end if;

  v_total := greatest(v_subtotal - v_discount, 0);
  v_amount_paid := round(coalesce(p_amount_paid, v_total), 2);

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
    v_line_subtotal := round(v_unit_price * (v_item->>'quantity')::numeric, 2);

    insert into order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal)
    values (v_order_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::numeric, v_unit_price, v_product.cost_price, v_line_subtotal);

    update products set stock_quantity = stock_quantity - (v_item->>'quantity')::numeric where id = (v_item->>'product_id')::uuid;

    insert into inventory_transactions (business_id, product_id, type, quantity, previous_quantity, new_quantity, reason, reference_type, reference_id, created_by)
    values (v_business_id, (v_item->>'product_id')::uuid, 'sale', -(v_item->>'quantity')::numeric,
            v_product.stock_quantity, v_product.stock_quantity - (v_item->>'quantity')::numeric, 'Order sale', 'order', v_order_id, auth.uid());
  end loop;

  return v_order_id;
end;
$function$;
