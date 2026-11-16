
-- ===========================================================================
-- 1. Platform-admin escalation. The "own profile" ALL policy let a user
--    delete and re-insert their profile with is_platform_admin = true (the
--    guard trigger only ran on UPDATE, and allowed anyone to elevate when no
--    admin existed). Users may now only read and rename their own profile;
--    is_platform_admin is not writable by any app user at all.
-- ===========================================================================
drop policy "own profile" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (id = auth.uid());
create policy "own profile update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (full_name, updated_at) on public.profiles to authenticated;

create or replace function public.prevent_self_admin_elevation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- auth.uid() is null for the SQL console / service role, which is how a
  -- platform admin is meant to be appointed.
  if auth.uid() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and coalesce(new.is_platform_admin, false))
     or (tg_op = 'UPDATE' and new.is_platform_admin is distinct from old.is_platform_admin) then
    if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
      raise exception 'Only an existing platform admin can change platform admin status';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger trg_prevent_self_admin_elevation on public.profiles;
create trigger trg_prevent_self_admin_elevation
  before insert or update on public.profiles
  for each row execute function public.prevent_self_admin_elevation();

-- ===========================================================================
-- 2. Subscription enforced on the server. Viewing stays allowed (the
--    business's data stays readable), but every add/edit/delete — through
--    RLS or any RPC that calls has_permission — needs an active or trial
--    subscription that hasn't passed its expiry date.
-- ===========================================================================
create or replace function public.business_subscription_active(p_business_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from subscriptions s
    where s.business_id = p_business_id
      and s.status in ('active', 'trial')
      and (s.expiry_date is null or s.expiry_date > now())
  );
$function$;

create or replace function public.has_permission(p_business_id uuid, p_feature text, p_action text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from business_members
    where business_id = p_business_id and user_id = auth.uid()
      and (permissions->p_feature->>p_action)::boolean is true
  )
  and (p_action = 'view' or public.business_subscription_active(p_business_id));
$function$;

-- ===========================================================================
-- 3–5. Ledger tables are written only by the SECURITY DEFINER functions
--    (create_order, create_return, adjust_stock, payments, cancel). Remove
--    every direct client write path so amounts, history and payments can't
--    be edited or deleted around them.
-- ===========================================================================
drop policy returns_insert_requires_permission on public.returns;
drop policy returns_update_requires_permission on public.returns;
drop policy returns_delete_requires_permission on public.returns;
drop policy return_items_insert_requires_permission on public.return_items;
drop policy return_items_update_requires_permission on public.return_items;
drop policy return_items_delete_requires_permission on public.return_items;
drop policy order_items_insert_requires_permission on public.order_items;
drop policy order_items_update_requires_permission on public.order_items;
drop policy order_items_delete_requires_permission on public.order_items;
drop policy orders_insert_requires_permission on public.orders;
drop policy orders_update_requires_permission on public.orders;
drop policy orders_delete_requires_permission on public.orders;
drop policy inventory_insert_requires_permission on public.inventory_transactions;
drop policy inventory_update_requires_permission on public.inventory_transactions;
drop policy inventory_delete_requires_permission on public.inventory_transactions;
drop policy customer_payments_insert_requires_permission on public.customer_payments;
drop policy customer_payments_update_requires_permission on public.customer_payments;
drop policy customer_payments_delete_requires_permission on public.customer_payments;

revoke insert, update, delete on
  public.orders, public.order_items, public.order_payments,
  public.returns, public.return_items, public.return_credit_allocations, public.refunds,
  public.inventory_transactions, public.customer_payments,
  public.subscriptions, public.business_members
from authenticated, anon;

-- ===========================================================================
-- 6. Business settings: only Business Settings (edit) may change them, and
--    never the order/return number counters.
-- ===========================================================================
drop policy "member updates business" on public.businesses;
create policy "settings editors update business" on public.businesses
  for update using (has_permission(id, 'settings', 'edit'))
  with check (has_permission(id, 'settings', 'edit'));

revoke insert, update, delete on public.businesses from authenticated, anon;
grant update (name, category, phone, address, currency, logo_url, updated_at) on public.businesses to authenticated;

-- ===========================================================================
-- 7. Products: editors can change details and prices, but stock only moves
--    through orders, returns and adjust_stock (which keep the inventory log),
--    and identity/unit fields can't be rewritten after creation.
-- ===========================================================================
revoke update on public.products from authenticated, anon;
grant update (name, sku, category_id, selling_price, cost_price, pack_price, low_stock_threshold, description, is_active, updated_at)
  on public.products to authenticated;

-- ===========================================================================
-- Defense in depth: signed-out visitors never touch app tables, and no
-- function is callable without signing in.
-- ===========================================================================
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Pin search_path on every public function that didn't set one.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
