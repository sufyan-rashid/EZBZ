
-- The output column "id" shadowed profiles.id in the admin check.
create or replace function public.admin_list_subscription_payments(p_limit integer default 200)
 returns table(
   id uuid, business_id uuid, business_name text, amount numeric, months integer,
   method text, reference text, new_expiry_date timestamptz, created_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from profiles pr where pr.id = auth.uid() and pr.is_platform_admin = true) then
    raise exception 'Not authorized';
  end if;

  return query
  select sp.id, sp.business_id, b.name, sp.amount, sp.months, sp.method, sp.reference, sp.new_expiry_date, sp.created_at
  from subscription_payments sp
  join businesses b on b.id = sp.business_id
  order by sp.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$function$;
