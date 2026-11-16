
CREATE OR REPLACE FUNCTION public.create_return(p_business_id uuid, p_customer_id uuid, p_items jsonb, p_deduction_type text, p_deduction_value numeric, p_notes text, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- No single original sale covers this quantity (different device not yet
      -- synced, no receipt, or quantity spans more than one past sale). Price
      -- it the same way a fresh sale would today: a pack-type product splits
      -- into whole packs (at the pack rate) plus any loose remainder (at the
      -- per-unit rate), instead of flatly charging every unit the loose rate
      -- and over-refunding the pack discount.
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
