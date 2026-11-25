
-- One subscription row per business (already true in the data; now enforced).
alter table public.subscriptions add constraint subscriptions_business_id_key unique (business_id);

-- Every renewal the platform admin records, so revenue is a real ledger
-- rather than a guess from the current monthly price.
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  months integer not null default 1 check (months between 1 and 24),
  method text,
  reference text,
  new_expiry_date timestamptz not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index subscription_payments_business_id_idx on public.subscription_payments (business_id);
create index subscription_payments_created_at_idx on public.subscription_payments (created_at desc);

-- Only reachable through the admin RPCs below.
alter table public.subscription_payments enable row level security;
revoke all on public.subscription_payments from anon, authenticated;

create or replace function public.admin_business_overview()
 returns table(
   business_id uuid, business_name text, business_phone text, category text, created_at timestamptz,
   owner_name text, owner_email text,
   plan text, status text, amount numeric, max_users integer, start_date timestamptz, expiry_date timestamptz,
   member_count bigint, order_count bigint, orders_last_30d bigint, last_order_at timestamptz,
   total_paid numeric, last_payment_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    b.id, b.name, b.phone, b.category, b.created_at,
    own.full_name, own.email,
    s.plan, s.status, s.amount, s.max_users, s.start_date, s.expiry_date,
    (select count(*) from business_members bm where bm.business_id = b.id),
    (select count(*) from orders o where o.business_id = b.id),
    (select count(*) from orders o where o.business_id = b.id and o.created_at > now() - interval '30 days'),
    (select max(o.created_at) from orders o where o.business_id = b.id),
    (select coalesce(sum(sp.amount), 0) from subscription_payments sp where sp.business_id = b.id),
    (select max(sp.created_at) from subscription_payments sp where sp.business_id = b.id)
  from businesses b
  left join lateral (
    select p.full_name, u.email::text as email
    from business_members bm
    join profiles p on p.id = bm.user_id
    join auth.users u on u.id = bm.user_id
    where bm.business_id = b.id and bm.role = 'Owner'
    order by bm.created_at
    limit 1
  ) own on true
  left join subscriptions s on s.business_id = b.id
  order by b.created_at desc;
end;
$function$;

-- Records a payment and extends the subscription in one step. Time still left
-- on the current period (trial or paid) is kept, not thrown away.
create or replace function public.admin_record_subscription_payment(
  p_business_id uuid,
  p_amount numeric,
  p_months integer default 1,
  p_method text default null,
  p_reference text default null)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sub subscriptions%rowtype;
  v_new_expiry timestamptz;
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be more than zero';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Months must be between 1 and 24';
  end if;

  select * into v_sub from subscriptions where business_id = p_business_id for update;
  if not found then
    raise exception 'This business has no subscription record';
  end if;

  v_new_expiry := greatest(coalesce(v_sub.expiry_date, now()), now()) + make_interval(months => p_months);

  update subscriptions
  set status = 'active',
      expiry_date = v_new_expiry,
      start_date = coalesce(start_date, now()),
      amount = round(p_amount / p_months, 2),
      updated_at = now()
  where id = v_sub.id;

  insert into subscription_payments (business_id, amount, months, method, reference, new_expiry_date, recorded_by)
  values (p_business_id, p_amount, p_months, nullif(trim(p_method), ''), nullif(trim(p_reference), ''), v_new_expiry, auth.uid());

  return v_new_expiry;
end;
$function$;

create or replace function public.admin_list_subscription_payments(p_limit integer default 200)
 returns table(
   id uuid, business_id uuid, business_name text, amount numeric, months integer,
   method text, reference text, new_expiry_date timestamptz, created_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
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

revoke execute on function public.admin_business_overview() from public, anon;
revoke execute on function public.admin_record_subscription_payment(uuid, numeric, integer, text, text) from public, anon;
revoke execute on function public.admin_list_subscription_payments(integer) from public, anon;
grant execute on function public.admin_business_overview() to authenticated;
grant execute on function public.admin_record_subscription_payment(uuid, numeric, integer, text, text) to authenticated;
grant execute on function public.admin_list_subscription_payments(integer) to authenticated;
