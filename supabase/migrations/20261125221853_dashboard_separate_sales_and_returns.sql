
-- "Today's Sales" used to be sales minus every return processed today, so a
-- return of an older sale could push it negative. Sales and returns are now
-- reported separately; profit is unchanged (still net of returns).
drop function public.get_dashboard_stats(uuid);

create function public.get_dashboard_stats(p_business_id uuid)
 returns table(today_sales numeric, today_returns numeric, today_orders integer, today_expenses numeric, today_profit numeric, total_outstanding numeric, payment_breakdown jsonb)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_sales numeric := 0; v_cogs numeric := 0; v_expenses numeric := 0; v_order_count integer := 0;
  v_returns_revenue numeric := 0; v_returns_cogs numeric := 0; v_outstanding numeric := 0;
  v_breakdown jsonb;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;

  select coalesce(sum(o.total), 0), count(*) into v_sales, v_order_count from orders o
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(net_amount), 0) into v_returns_revenue from returns
  where business_id = v_business_id and (created_at at time zone 'Asia/Karachi')::date = v_today;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at at time zone 'Asia/Karachi')::date = v_today;
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

  return query select
    v_sales,
    v_returns_revenue,
    v_order_count,
    v_expenses,
    (v_sales - v_returns_revenue) - (v_cogs - v_returns_cogs) - v_expenses,
    v_outstanding,
    v_breakdown;
end;
$function$;

revoke execute on function public.get_dashboard_stats(uuid) from public, anon;
grant execute on function public.get_dashboard_stats(uuid) to authenticated;

-- The chart shows what was sold each day, matching the "Today's Sales" card.
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
  select d::date as day, coalesce(sum(o.total), 0) as total
  from generate_series(v_today - (p_days - 1), v_today, interval '1 day') d
  left join orders o on o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = d::date and o.status = 'completed'
  group by d order by d;
end;
$function$;
