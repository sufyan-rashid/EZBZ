-- EZBZ database schema snapshot (public schema + storage policies).

-- Generated from the live database; recreates the schema on an empty Supabase project.

-- ===== Tables =====

create table public.active_sessions (
  user_id uuid not null,
  session_id text not null,
  device_name text,
  updated_at timestamp with time zone default now() not null
);

create table public.business_invitations (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  email text not null,
  role text default 'Team Member'::text,
  permissions jsonb default '{}'::jsonb not null,
  status text default 'pending'::text not null,
  invited_by uuid,
  created_at timestamp with time zone default now() not null,
  accepted_at timestamp with time zone
);

create table public.business_members (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  user_id uuid not null,
  role text default 'Team Member'::text not null,
  permissions jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table public.businesses (
  id uuid default gen_random_uuid() not null,
  name text not null,
  category text,
  phone text,
  address text,
  currency text default 'PKR'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  logo_url text,
  next_order_number integer default 1 not null,
  next_return_number integer default 1 not null
);

create table public.customer_payments (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  customer_id uuid not null,
  amount numeric(10,2) not null,
  payment_method text default 'cash'::text not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  created_by uuid
);

create table public.customers (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.expenses (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  title text not null,
  category text not null,
  amount numeric(10,2) not null,
  date date default CURRENT_DATE not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.inventory_transactions (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid not null,
  type text not null,
  quantity numeric(10,3) not null,
  previous_quantity numeric(10,3) not null,
  new_quantity numeric(10,3) not null,
  reason text,
  reference_type text,
  reference_id uuid,
  created_at timestamp with time zone default now() not null,
  created_by uuid
);

create table public.order_items (
  id uuid default gen_random_uuid() not null,
  order_id uuid not null,
  product_id uuid not null,
  quantity numeric(10,3) not null,
  unit_price numeric(10,2) not null,
  unit_cost numeric(12,4) not null,
  subtotal numeric(10,2) not null,
  returned_quantity numeric(10,3) default 0 not null
);

create table public.order_payments (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid not null,
  customer_id uuid,
  amount numeric(10,2) not null,
  payment_method text default 'cash'::text not null,
  received_at timestamp with time zone default now() not null,
  received_by uuid,
  created_at timestamp with time zone default now() not null
);

create table public.orders (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  customer_id uuid,
  order_number text not null,
  status text default 'completed'::text not null,
  subtotal numeric(10,2) default 0 not null,
  discount_type text default 'flat'::text not null,
  discount_value numeric(10,2) default 0 not null,
  discount numeric(10,2) default 0 not null,
  total numeric(10,2) default 0 not null,
  amount_paid numeric(10,2) default 0 not null,
  payment_method text default 'cash'::text not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  cancelled_by uuid,
  credited_amount numeric(12,2) default 0 not null
);

create table public.product_categories (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table public.products (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  category_id uuid,
  name text not null,
  sku text,
  selling_price numeric(10,2) not null,
  cost_price numeric(12,4) not null,
  stock_quantity numeric(10,3) default 0 not null,
  low_stock_threshold numeric(10,3) default 5 not null,
  unit text,
  description text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unit_type text default 'each'::text not null,
  pack_size numeric(10,3),
  pack_price numeric(10,2)
);

create table public.profiles (
  id uuid not null,
  full_name text not null,
  is_platform_admin boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.refunds (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  return_id uuid,
  order_id uuid,
  customer_id uuid,
  amount numeric(12,2) not null,
  payment_method text default 'cash'::text not null,
  reason text not null,
  refunded_at timestamp with time zone default now() not null,
  refunded_by uuid
);

create table public.return_credit_allocations (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  return_id uuid not null,
  order_id uuid not null,
  amount numeric(12,2) not null,
  created_at timestamp with time zone default now() not null
);

create table public.return_items (
  id uuid default gen_random_uuid() not null,
  return_id uuid not null,
  product_id uuid not null,
  order_item_id uuid,
  quantity numeric(10,3) not null,
  unit_price numeric(10,2) not null,
  unit_cost numeric(10,2) default 0 not null,
  subtotal numeric(10,2) not null
);

create table public.returns (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  customer_id uuid,
  return_number text not null,
  gross_amount numeric(10,2) default 0 not null,
  deduction_type text default 'flat'::text not null,
  deduction_value numeric(10,2) default 0 not null,
  deduction_amount numeric(10,2) default 0 not null,
  net_amount numeric(10,2) default 0 not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  credit_applied numeric(12,2) default 0 not null,
  cash_refunded numeric(12,2) default 0 not null,
  refund_method text default 'cash'::text not null
);

create table public.subscriptions (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  plan text default 'monthly'::text not null,
  status text default 'pending'::text not null,
  amount numeric(10,2) default 0 not null,
  currency text default 'PKR'::text not null,
  start_date timestamp with time zone,
  expiry_date timestamp with time zone,
  max_users integer default 3 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- ===== Constraints =====

alter table public.active_sessions add constraint active_sessions_pkey PRIMARY KEY (user_id);
alter table public.business_invitations add constraint business_invitations_pkey PRIMARY KEY (id);
alter table public.business_members add constraint business_members_pkey PRIMARY KEY (id);
alter table public.businesses add constraint businesses_pkey PRIMARY KEY (id);
alter table public.customer_payments add constraint customer_payments_pkey PRIMARY KEY (id);
alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
alter table public.expenses add constraint expenses_pkey PRIMARY KEY (id);
alter table public.inventory_transactions add constraint inventory_transactions_pkey PRIMARY KEY (id);
alter table public.order_items add constraint order_items_pkey PRIMARY KEY (id);
alter table public.order_payments add constraint order_payments_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.product_categories add constraint product_categories_pkey PRIMARY KEY (id);
alter table public.products add constraint products_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.refunds add constraint refunds_pkey PRIMARY KEY (id);
alter table public.return_credit_allocations add constraint return_credit_allocations_pkey PRIMARY KEY (id);
alter table public.return_items add constraint return_items_pkey PRIMARY KEY (id);
alter table public.returns add constraint returns_pkey PRIMARY KEY (id);
alter table public.subscriptions add constraint subscriptions_pkey PRIMARY KEY (id);
alter table public.business_members add constraint business_members_business_id_user_id_key UNIQUE (business_id, user_id);
alter table public.orders add constraint orders_business_id_order_number_key UNIQUE (business_id, order_number);
alter table public.returns add constraint returns_business_id_return_number_key UNIQUE (business_id, return_number);
alter table public.business_invitations add constraint business_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])));
alter table public.customer_payments add constraint customer_payments_amount_check CHECK ((amount > (0)::numeric));
alter table public.customer_payments add constraint customer_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'bank'::text, 'online'::text, 'other'::text])));
alter table public.expenses add constraint expenses_amount_check CHECK ((amount > (0)::numeric));
alter table public.order_items add constraint order_items_quantity_check CHECK ((quantity > (0)::numeric));
alter table public.order_payments add constraint order_payments_amount_check CHECK ((amount > (0)::numeric));
alter table public.orders add constraint orders_discount_type_check CHECK ((discount_type = ANY (ARRAY['flat'::text, 'percentage'::text])));
alter table public.orders add constraint orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'bank'::text, 'online'::text, 'other'::text])));
alter table public.products add constraint products_cost_price_check CHECK ((cost_price >= (0)::numeric));
alter table public.products add constraint products_selling_price_check CHECK ((selling_price >= (0)::numeric));
alter table public.products add constraint products_stock_quantity_check CHECK ((stock_quantity >= (0)::numeric));
alter table public.products add constraint products_unit_type_check CHECK ((unit_type = ANY (ARRAY['each'::text, 'weight'::text, 'pack'::text])));
alter table public.refunds add constraint refunds_amount_check CHECK ((amount > (0)::numeric));
alter table public.refunds add constraint refunds_reason_check CHECK ((reason = ANY (ARRAY['return'::text, 'order_cancelled'::text])));
alter table public.return_credit_allocations add constraint return_credit_allocations_amount_check CHECK ((amount > (0)::numeric));
alter table public.return_items add constraint return_items_quantity_check CHECK ((quantity > (0)::numeric));
alter table public.returns add constraint returns_deduction_type_check CHECK ((deduction_type = ANY (ARRAY['flat'::text, 'percentage'::text])));
alter table public.active_sessions add constraint active_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.business_invitations add constraint business_invitations_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.business_invitations add constraint business_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES profiles(id);
alter table public.business_members add constraint business_members_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.business_members add constraint business_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.customer_payments add constraint customer_payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.customer_payments add constraint customer_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.customer_payments add constraint customer_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
alter table public.customers add constraint customers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.expenses add constraint expenses_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.inventory_transactions add constraint inventory_transactions_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.inventory_transactions add constraint inventory_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.inventory_transactions add constraint inventory_transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.order_payments add constraint order_payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.order_payments add constraint order_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public.order_payments add constraint order_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_payments add constraint order_payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES auth.users(id);
alter table public.orders add constraint orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES profiles(id);
alter table public.orders add constraint orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.orders add constraint orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public.product_categories add constraint product_categories_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.products add constraint products_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.products add constraint products_category_id_fkey FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.refunds add constraint refunds_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.refunds add constraint refunds_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public.refunds add constraint refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.refunds add constraint refunds_refunded_by_fkey FOREIGN KEY (refunded_by) REFERENCES auth.users(id);
alter table public.refunds add constraint refunds_return_id_fkey FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE;
alter table public.return_credit_allocations add constraint return_credit_allocations_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.return_credit_allocations add constraint return_credit_allocations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.return_credit_allocations add constraint return_credit_allocations_return_id_fkey FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE;
alter table public.return_items add constraint return_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id);
alter table public.return_items add constraint return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
alter table public.return_items add constraint return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE;
alter table public.returns add constraint returns_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.returns add constraint returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.returns add constraint returns_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public.subscriptions add constraint subscriptions_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

-- ===== Indexes =====

CREATE UNIQUE INDEX inventory_transactions_ref_product_key ON public.inventory_transactions USING btree (reference_type, reference_id, type, product_id) WHERE (type <> 'customer_return'::text);
CREATE INDEX order_payments_business_date_idx ON public.order_payments USING btree (business_id, received_at);
CREATE INDEX order_payments_customer_idx ON public.order_payments USING btree (customer_id);
CREATE INDEX order_payments_order_idx ON public.order_payments USING btree (order_id);
CREATE UNIQUE INDEX products_business_id_sku_active_key ON public.products USING btree (business_id, sku) WHERE (is_active = true);
CREATE INDEX refunds_business_date_idx ON public.refunds USING btree (business_id, refunded_at);
CREATE INDEX return_credit_allocations_order_idx ON public.return_credit_allocations USING btree (order_id);

-- ===== Functions =====

CREATE OR REPLACE FUNCTION public.accept_pending_invitations(p_invitation_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_email text;
  v_invitation record;
begin
  select email into v_user_email from auth.users where id = auth.uid();

  if p_invitation_id is not null then
    select * into v_invitation
    from business_invitations
    where id = p_invitation_id and lower(email) = lower(v_user_email) and status = 'pending';
  else
    select * into v_invitation
    from business_invitations
    where lower(email) = lower(v_user_email) and status = 'pending'
    order by created_at asc limit 1;
  end if;

  if v_invitation.id is null then return null; end if;

  if not exists (select 1 from business_members where business_id = v_invitation.business_id and user_id = auth.uid()) then
    insert into business_members (business_id, user_id, role, permissions)
    values (v_invitation.business_id, auth.uid(), v_invitation.role, v_invitation.permissions);
  end if;

  update business_invitations set status = 'accepted', accepted_at = now() where id = v_invitation.id;
  return v_invitation.business_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.activate_test_subscription(p_business_id uuid, p_days integer DEFAULT 30)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id uuid, p_quantity_change numeric, p_reason text, p_total_cost numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not has_permission(v_business_id, 'inventory', 'edit') then
    raise exception 'You do not have permission to adjust inventory';
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_find_business(p_search text)
 RETURNS TABLE(business_id uuid, business_name text, owner_name text, owner_email text, plan text, status text, max_users integer, expiry_date timestamp with time zone, member_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
    raise exception 'Not authorized';
  end if;

  return query
  select distinct on (b.id)
    b.id,
    b.name,
    p.full_name,
    u.email::text,
    s.plan,
    s.status,
    s.max_users,
    s.expiry_date,
    (select count(*) from business_members bm2 where bm2.business_id = b.id)
  from businesses b
  join business_members owner_bm on owner_bm.business_id = b.id and owner_bm.role = 'Owner'
  join profiles p on p.id = owner_bm.user_id
  join auth.users u on u.id = owner_bm.user_id
  left join subscriptions s on s.business_id = b.id
  where b.name ilike '%' || p_search || '%'
     or u.email ilike '%' || p_search || '%'
     or p.full_name ilike '%' || p_search || '%'
  order by b.id, owner_bm.created_at
  limit 20;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_all_businesses()
 RETURNS TABLE(business_id uuid, business_name text, owner_name text, owner_email text, plan text, status text, max_users integer, expiry_date timestamp with time zone, member_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
    raise exception 'Not authorized';
  end if;

  return query
  select distinct on (b.id)
    b.id,
    b.name,
    p.full_name,
    u.email::text,
    s.plan,
    s.status,
    s.max_users,
    s.expiry_date,
    (select count(*) from business_members bm2 where bm2.business_id = b.id)
  from businesses b
  join business_members owner_bm on owner_bm.business_id = b.id and owner_bm.role = 'Owner'
  join profiles p on p.id = owner_bm.user_id
  join auth.users u on u.id = owner_bm.user_id
  left join subscriptions s on s.business_id = b.id
  order by b.id, owner_bm.created_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_subscription(p_business_id uuid, p_status text, p_expiry_date timestamp with time zone, p_amount numeric DEFAULT NULL::numeric, p_max_users integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_platform_admin = true) then
    raise exception 'Not authorized';
  end if;

  update subscriptions
  set status = p_status, expiry_date = p_expiry_date,
      amount = coalesce(p_amount, amount), max_users = coalesce(p_max_users, max_users),
      updated_at = now()
  where business_id = p_business_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_cancel_order(p_order_id uuid, p_reason text DEFAULT 'Order cancelled'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_status text;
  v_credited numeric;
  v_item record;
begin
  select business_id, status, credited_amount into v_business_id, v_status, v_credited
  from orders where id = p_order_id;

  if v_business_id is null then
    raise exception 'Order not found';
  end if;

  if not has_permission(v_business_id, 'orders', 'delete') then
    raise exception 'Not authorized for this business';
  end if;

  if v_status = 'cancelled' then
    raise exception 'This order is already cancelled';
  end if;

  if exists (select 1 from order_items where order_id = p_order_id and returned_quantity > 0) then
    raise exception 'Some items on this order were already returned. Process a return for the remaining items instead of cancelling.';
  end if;

  if v_credited > 0 then
    raise exception 'A return credit has been applied to this order. Process a return for the remaining items instead of cancelling.';
  end if;

  for v_item in select oi.product_id, oi.quantity from order_items oi where oi.order_id = p_order_id loop
    update products set stock_quantity = stock_quantity + v_item.quantity where id = v_item.product_id;

    insert into inventory_transactions (
      business_id, product_id, type, quantity, previous_quantity, new_quantity, reason, reference_type, reference_id, created_by
    )
    select v_business_id, v_item.product_id, 'return', v_item.quantity,
           p.stock_quantity - v_item.quantity, p.stock_quantity,
           p_reason, 'order', p_order_id, auth.uid()
    from products p where p.id = v_item.product_id;
  end loop;

  insert into refunds (business_id, order_id, customer_id, amount, payment_method, reason, refunded_by)
  select business_id, order_id, customer_id, sum(amount), payment_method, 'order_cancelled', auth.uid()
  from order_payments where order_id = p_order_id
  group by business_id, order_id, customer_id, payment_method
  having sum(amount) > 0;

  update orders set status = 'cancelled', updated_at = now() where id = p_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_record_order_payment(p_order_id uuid, p_amount numeric, p_payment_method text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order record;
  v_due numeric;
begin
  select * into v_order from orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if not has_permission(v_order.business_id, 'orders', 'edit') then
    raise exception 'You do not have permission to record payments on orders';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cannot record payment on a cancelled order';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0';
  end if;

  v_due := greatest(0, v_order.total - v_order.amount_paid - v_order.credited_amount);
  if round(p_amount, 2) > round(v_due, 2) then
    raise exception 'Amount exceeds the outstanding balance of %', v_due;
  end if;

  update orders set amount_paid = amount_paid + p_amount, updated_at = now() where id = p_order_id;

  insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_by)
  values (v_order.business_id, p_order_id, v_order.customer_id, p_amount, coalesce(p_payment_method, v_order.payment_method, 'cash'), auth.uid());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.business_subscription_active(p_business_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from subscriptions s
    where s.business_id = p_business_id
      and s.status in ('active', 'trial')
      and (s.expiry_date is null or s.expiry_date > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.create_business_for_new_user(p_name text, p_category text, p_phone text, p_address text, p_currency text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_full_permissions jsonb := '{
    "dashboard": {"view": true},
    "orders": {"view": true, "add": true, "edit": true, "delete": true},
    "customers": {"view": true, "add": true, "edit": true, "delete": true},
    "products": {"view": true, "add": true, "edit": true, "delete": true},
    "inventory": {"view": true, "edit": true},
    "expenses": {"view": true, "add": true, "edit": true, "delete": true},
    "reports": {"view": true},
    "returns": {"view": true, "add": true},
    "team": {"view": true, "add": true, "edit": true, "delete": true},
    "settings": {"view": true, "edit": true},
    "data": {"view": true}
  }'::jsonb;
begin
  -- Deliberately no "already has a business, return it" short-circuit here:
  -- this is called from the explicit "+ Create New Business" action, and one
  -- account is allowed to own multiple businesses. Each one gets its own
  -- Owner membership, subscription, and (via business_id scoping everywhere
  -- else in the schema) its own separate data/exports.
  insert into businesses (name, category, phone, address, currency)
  values (p_name, p_category, p_phone, p_address, coalesce(p_currency, 'PKR'))
  returning id into v_business_id;

  insert into business_members (business_id, user_id, role, permissions)
  values (v_business_id, auth.uid(), 'Owner', v_full_permissions);

  insert into subscriptions (business_id, plan, status, amount, currency, start_date, expiry_date, max_users)
  values (v_business_id, 'monthly', 'trial', 0, coalesce(p_currency, 'PKR'), now(), now() + interval '7 days', 3);

  return v_business_id;
end;
$function$
;

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

  if not has_permission(v_business_id, 'orders', 'add') then
    raise exception 'You do not have permission to create orders';
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_return(p_business_id uuid, p_customer_id uuid, p_items jsonb, p_deduction_type text, p_deduction_value numeric, p_notes text, p_dry_run boolean DEFAULT false, p_refund_method text DEFAULT 'cash'::text)
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
  v_refund_method text := coalesce(nullif(p_refund_method, ''), 'cash');
  v_customer_due numeric := 0;
  v_credit numeric := 0;
  v_cash_refund numeric := 0;
  v_remaining numeric;
  v_apply numeric;
  v_ord record;
begin
  if not has_permission(v_business_id, 'returns', 'add') then
    raise exception 'You do not have permission to process returns';
  end if;

  if v_refund_method not in ('cash', 'card', 'bank', 'online', 'other') then
    raise exception 'Invalid refund method';
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
    v_deduction := round(p_deduction_value, 2);
  end if;
  v_net := round(greatest(v_gross - v_deduction, 0), 2);

  -- A customer who still owes money gets the return value knocked off their
  -- balance first; handing them cash while they owe us would leave the
  -- khata overstated. Only what exceeds their balance is paid out.
  if p_customer_id is not null and v_net > 0 then
    select coalesce(sum(total - amount_paid - credited_amount), 0) into v_customer_due
    from orders
    where business_id = v_business_id and customer_id = p_customer_id and status = 'completed'
      and total - amount_paid - credited_amount > 0;
    v_credit := least(v_net, v_customer_due);
  end if;
  v_cash_refund := v_net - v_credit;

  if not p_dry_run then
    if v_credit > 0 then
      v_remaining := v_credit;
      for v_ord in
        select id, total - amount_paid - credited_amount as due
        from orders
        where business_id = v_business_id and customer_id = p_customer_id and status = 'completed'
          and total - amount_paid - credited_amount > 0
        order by created_at asc
      loop
        exit when v_remaining <= 0;
        v_apply := least(v_remaining, v_ord.due);
        update orders set credited_amount = credited_amount + v_apply, updated_at = now() where id = v_ord.id;
        insert into return_credit_allocations (business_id, return_id, order_id, amount)
        values (v_business_id, v_return_id, v_ord.id, v_apply);
        v_remaining := v_remaining - v_apply;
      end loop;
    end if;

    if v_cash_refund > 0 then
      insert into refunds (business_id, return_id, customer_id, amount, payment_method, reason, refunded_by)
      values (v_business_id, v_return_id, p_customer_id, v_cash_refund, v_refund_method, 'return', auth.uid());
    end if;

    update returns set gross_amount = v_gross, deduction_type = p_deduction_type, deduction_value = p_deduction_value,
      deduction_amount = v_deduction, net_amount = v_net,
      credit_applied = v_credit, cash_refunded = v_cash_refund, refund_method = v_refund_method
    where id = v_return_id;
  end if;

  return jsonb_build_object('return_id', v_return_id, 'return_number', v_return_number, 'items', v_line_items,
    'gross_amount', v_gross, 'deduction_amount', v_deduction, 'net_amount', v_net,
    'customer_due', v_customer_due, 'credit_applied', v_credit, 'cash_refund', v_cash_refund);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customers_with_balance(p_business_id uuid)
 RETURNS TABLE(id uuid, name text, phone text, total_purchases numeric, total_paid numeric, total_due numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_business_id uuid := p_business_id;
begin
  if not has_permission(v_business_id, 'customers', 'view') then
    raise exception 'You do not have permission to view customers';
  end if;

  return query
  select c.id, c.name, c.phone,
    coalesce(o.total_purchases, 0) as total_purchases,
    coalesce(o.total_paid_orders, 0) + coalesce(p.total_extra_payments, 0) as total_paid,
    greatest(coalesce(o.total_purchases, 0)
      - coalesce(o.total_credited, 0)
      - (coalesce(o.total_paid_orders, 0) + coalesce(p.total_extra_payments, 0)), 0) as total_due
  from customers c
  left join (
    select customer_id, sum(total) as total_purchases, sum(amount_paid) as total_paid_orders, sum(credited_amount) as total_credited
    from orders where business_id = v_business_id and status = 'completed' group by customer_id
  ) o on o.customer_id = c.id
  left join (
    select customer_id, sum(amount) as total_extra_payments from customer_payments where business_id = v_business_id group by customer_id
  ) p on p.customer_id = c.id
  where c.business_id = v_business_id
  order by c.name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_business_id uuid)
 RETURNS TABLE(today_sales numeric, today_orders integer, today_expenses numeric, today_profit numeric, total_outstanding numeric, payment_breakdown jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_revenue numeric := 0; v_cogs numeric := 0; v_expenses numeric := 0; v_order_count integer := 0;
  v_returns_revenue numeric := 0; v_returns_cogs numeric := 0; v_outstanding numeric := 0;
  v_breakdown jsonb;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;

  select coalesce(sum(o.total), 0), count(*) into v_revenue, v_order_count from orders o
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = v_today and o.status = 'completed';
  select coalesce(sum(net_amount), 0) into v_returns_revenue from returns
  where business_id = v_business_id and (created_at at time zone 'Asia/Karachi')::date = v_today;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at at time zone 'Asia/Karachi')::date = v_today;
  v_revenue := v_revenue - v_returns_revenue;
  v_cogs := v_cogs - v_returns_cogs;
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

  return query select v_revenue, v_order_count, v_expenses, (v_revenue - v_cogs - v_expenses), v_outstanding, v_breakdown;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_report(p_business_id uuid, p_start_date date, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid := p_business_id; v_result jsonb; v_total_sales numeric := 0; v_order_count integer := 0; v_avg_order numeric := 0;
  v_revenue numeric := 0; v_cogs numeric := 0; v_gross_profit numeric := 0; v_expenses numeric := 0; v_net_profit numeric := 0;
  v_returns_revenue numeric := 0; v_returns_cogs numeric := 0; v_top_products jsonb; v_expense_categories jsonb; v_payment_breakdown jsonb;
begin
  if not has_permission(v_business_id, 'reports', 'view') then
    raise exception 'You do not have permission to view reports';
  end if;

  select coalesce(sum(total), 0), count(*) into v_total_sales, v_order_count from orders
  where business_id = v_business_id and (created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date and status = 'completed';
  select coalesce(sum(oi.unit_cost * oi.quantity), 0) into v_cogs from order_items oi join orders o on o.id = oi.order_id
  where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date and o.status = 'completed';
  select coalesce(sum(net_amount), 0) into v_returns_revenue from returns
  where business_id = v_business_id and (created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date;
  select coalesce(sum(ri.unit_cost * ri.quantity), 0) into v_returns_cogs from return_items ri join returns r on r.id = ri.return_id
  where r.business_id = v_business_id and (r.created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date;
  v_revenue := v_total_sales - v_returns_revenue;
  v_cogs := v_cogs - v_returns_cogs;
  v_avg_order := case when v_order_count > 0 then v_total_sales / v_order_count else 0 end;
  v_gross_profit := v_revenue - v_cogs;
  select coalesce(sum(amount), 0) into v_expenses from expenses where business_id = v_business_id and date between p_start_date and p_end_date;
  v_net_profit := v_gross_profit - v_expenses;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_products from (
    select p.name, sum(oi.quantity) as quantity_sold, sum(oi.subtotal) as revenue
    from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
    where o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date and o.status = 'completed'
    group by p.name order by quantity_sold desc limit 5
  ) t;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_expense_categories from (
    select category, sum(amount) as total from expenses where business_id = v_business_id and date between p_start_date and p_end_date
    group by category order by total desc
  ) t;
  select coalesce(jsonb_object_agg(payment_method, total), '{}'::jsonb) into v_payment_breakdown from (
    select payment_method, sum(amt) as total from (
      select payment_method, amount as amt from order_payments
      where business_id = v_business_id and (received_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date
      union all
      select payment_method, -amount from refunds
      where business_id = v_business_id and (refunded_at at time zone 'Asia/Karachi')::date between p_start_date and p_end_date
    ) m group by payment_method
  ) t;

  v_result := jsonb_build_object(
    'total_sales', v_revenue, 'order_count', v_order_count, 'avg_order_value', v_avg_order,
    'revenue', v_revenue, 'cogs', v_cogs, 'gross_profit', v_gross_profit,
    'expenses', v_expenses, 'net_profit', v_net_profit,
    'top_products', v_top_products, 'expense_categories', v_expense_categories, 'payment_breakdown', v_payment_breakdown
  );
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sales_chart(p_business_id uuid, p_days integer DEFAULT 7)
 RETURNS TABLE(day date, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid := p_business_id;
  v_today date := (now() at time zone 'Asia/Karachi')::date;
begin
  if not has_permission(v_business_id, 'dashboard', 'view') then
    raise exception 'You do not have permission to view the dashboard';
  end if;
  return query
  select d::date as day,
    coalesce(sum(o.total), 0) - coalesce((select sum(r.net_amount) from returns r where r.business_id = v_business_id and (r.created_at at time zone 'Asia/Karachi')::date = d::date), 0) as total
  from generate_series(v_today - (p_days - 1), v_today, interval '1 day') d
  left join orders o on o.business_id = v_business_id and (o.created_at at time zone 'Asia/Karachi')::date = d::date and o.status = 'completed'
  group by d order by d;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_members(p_business_id uuid)
 RETURNS TABLE(id uuid, role text, permissions jsonb, user_id uuid, full_name text, email text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_permission(p_business_id, 'team', 'view') then
    raise exception 'You do not have permission to view the team';
  end if;

  return query
  select bm.id, bm.role, bm.permissions, bm.user_id, p.full_name, u.email::text, bm.created_at
  from business_members bm
  join profiles p on p.id = bm.user_id
  join auth.users u on u.id = bm.user_id
  where bm.business_id = p_business_id
  order by bm.created_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_business_id uuid, p_feature text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from business_members
    where business_id = p_business_id and user_id = auth.uid()
      and (permissions->p_feature->>p_action)::boolean is true
  )
  and (p_action = 'view' or public.business_subscription_active(p_business_id));
$function$
;

CREATE OR REPLACE FUNCTION public.invite_team_member(p_business_id uuid, p_email text, p_role_label text, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_my_pending_invitations()
 RETURNS TABLE(invitation_id uuid, business_id uuid, business_name text, role text, invited_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_email text;
begin
  select email into v_user_email from auth.users where id = auth.uid();
  return query
  select bi.id, bi.business_id, b.name, bi.role, bi.created_at
  from business_invitations bi
  join businesses b on b.id = bi.business_id
  where lower(bi.email) = lower(v_user_email) and bi.status = 'pending'
  order by bi.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_self_admin_elevation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.promote_to_co_owner(p_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_caller_role text;
begin
  select business_id into v_business_id from business_members where id = p_member_id;
  if v_business_id is null then
    raise exception 'Team member not found';
  end if;

  select role into v_caller_role from business_members
  where business_id = v_business_id and user_id = auth.uid();

  if v_caller_role is distinct from 'Owner' then
    raise exception 'Only an existing owner can promote a co-owner';
  end if;

  update business_members
  set role = 'Owner',
      permissions = '{
        "dashboard": {"view": true},
        "orders": {"view": true, "add": true, "edit": true, "delete": true},
        "customers": {"view": true, "add": true, "edit": true, "delete": true},
        "products": {"view": true, "add": true, "edit": true, "delete": true},
        "inventory": {"view": true, "edit": true},
        "expenses": {"view": true, "add": true, "edit": true, "delete": true},
        "reports": {"view": true},
        "returns": {"view": true, "add": true},
        "team": {"view": true, "add": true, "edit": true, "delete": true},
        "settings": {"view": true, "edit": true},
        "data": {"view": true}
      }'::jsonb
  where id = p_member_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_customer_payment(p_customer_id uuid, p_amount numeric, p_payment_method text DEFAULT 'cash'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_remaining numeric := round(p_amount, 2);
  v_total_due numeric;
  v_order record;
  v_apply numeric;
begin
  select business_id into v_business_id from customers where id = p_customer_id;

  if v_business_id is null then
    raise exception 'Customer not found';
  end if;

  if not has_permission(v_business_id, 'orders', 'edit') then
    raise exception 'You do not have permission to record payments';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  select coalesce(sum(total - amount_paid - credited_amount), 0) into v_total_due
  from orders where customer_id = p_customer_id and status = 'completed'
    and total - amount_paid - credited_amount > 0;

  if v_remaining > round(v_total_due, 2) then
    raise exception 'Amount exceeds the outstanding balance of %', v_total_due;
  end if;

  for v_order in
    select id, total - amount_paid - credited_amount as due
    from orders
    where customer_id = p_customer_id and status = 'completed'
      and total - amount_paid - credited_amount > 0
    order by created_at asc
  loop
    exit when v_remaining <= 0;
    v_apply := least(v_remaining, v_order.due);
    update orders set amount_paid = amount_paid + v_apply, updated_at = now() where id = v_order.id;
    insert into order_payments (business_id, order_id, customer_id, amount, payment_method, received_by)
    values (v_business_id, v_order.id, p_customer_id, v_apply, coalesce(p_payment_method, 'cash'), auth.uid());
    v_remaining := v_remaining - v_apply;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_team_member(p_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_role text;
  v_caller_member_id uuid;
  v_owner_count integer;
begin
  select business_id, role into v_business_id, v_role from business_members where id = p_member_id;
  if v_business_id is null then
    raise exception 'Team member not found';
  end if;

  if not has_permission(v_business_id, 'team', 'delete') then
    raise exception 'You do not have permission to manage the team';
  end if;

  select id into v_caller_member_id from business_members
  where business_id = v_business_id and user_id = auth.uid();

  if v_caller_member_id = p_member_id then
    raise exception 'You cannot remove yourself';
  end if;

  if v_role = 'Owner' then
    select count(*) into v_owner_count from business_members
    where business_id = v_business_id and role = 'Owner';
    if v_owner_count <= 1 then
      raise exception 'Cannot remove the only owner of the business';
    end if;
  end if;

  delete from business_members where id = p_member_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_order_cancelled_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.cancelled_by is null then
    new.cancelled_by := auth.uid();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_order_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_member_permissions(p_member_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id uuid;
  v_role text;
begin
  select business_id, role into v_business_id, v_role from business_members where id = p_member_id;
  if v_business_id is null then
    raise exception 'Team member not found';
  end if;

  if not has_permission(v_business_id, 'team', 'edit') then
    raise exception 'You do not have permission to manage the team';
  end if;

  if v_role = 'Owner' then
    raise exception 'Owner permissions cannot be edited';
  end if;

  update business_members set permissions = p_permissions where id = p_member_id;
end;
$function$
;

-- ===== Row level security =====

alter table public.active_sessions enable row level security;
alter table public.business_invitations enable row level security;
alter table public.business_members enable row level security;
alter table public.businesses enable row level security;
alter table public.customer_payments enable row level security;
alter table public.customers enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.order_items enable row level security;
alter table public.order_payments enable row level security;
alter table public.orders enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.refunds enable row level security;
alter table public.return_credit_allocations enable row level security;
alter table public.return_items enable row level security;
alter table public.returns enable row level security;
alter table public.subscriptions enable row level security;

-- ===== Policies =====

create policy "own session" on public.active_sessions as PERMISSIVE for ALL to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy invitations_delete_requires_permission on public.business_invitations as PERMISSIVE for DELETE to public
  using (has_permission(business_id, 'team'::text, 'delete'::text));

create policy invitations_insert_requires_permission on public.business_invitations as PERMISSIVE for INSERT to public
  with check (has_permission(business_id, 'team'::text, 'add'::text));

create policy invitations_select_requires_permission on public.business_invitations as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'team'::text, 'view'::text));

create policy invitations_update_requires_permission on public.business_invitations as PERMISSIVE for UPDATE to public
  using (has_permission(business_id, 'team'::text, 'edit'::text));

create policy "own memberships" on public.business_members as PERMISSIVE for SELECT to public
  using ((user_id = auth.uid()));

create policy "permitted view team members" on public.business_members as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'team'::text, 'view'::text));

create policy "member businesses" on public.businesses as PERMISSIVE for SELECT to public
  using ((id IN ( SELECT business_members.business_id
   FROM business_members
  WHERE (business_members.user_id = auth.uid()))));

create policy "platform admins see all businesses" on public.businesses as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_platform_admin = true)))));

create policy "settings editors update business" on public.businesses as PERMISSIVE for UPDATE to public
  using (has_permission(id, 'settings'::text, 'edit'::text))
  with check (has_permission(id, 'settings'::text, 'edit'::text));

create policy customer_payments_select_requires_permission on public.customer_payments as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'orders'::text, 'edit'::text));

create policy customers_delete_owner_only on public.customers as RESTRICTIVE for DELETE to public
  using ((EXISTS ( SELECT 1
   FROM business_members
  WHERE ((business_members.business_id = customers.business_id) AND (business_members.user_id = auth.uid()) AND (business_members.role = 'Owner'::text)))));

create policy customers_delete_requires_permission on public.customers as PERMISSIVE for DELETE to public
  using (has_permission(business_id, 'customers'::text, 'delete'::text));

create policy customers_insert_requires_permission on public.customers as PERMISSIVE for INSERT to public
  with check (has_permission(business_id, 'customers'::text, 'add'::text));

create policy customers_select_requires_permission on public.customers as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'customers'::text, 'view'::text));

create policy customers_update_requires_permission on public.customers as PERMISSIVE for UPDATE to public
  using (has_permission(business_id, 'customers'::text, 'edit'::text));

create policy expenses_delete_requires_permission on public.expenses as PERMISSIVE for DELETE to public
  using (has_permission(business_id, 'expenses'::text, 'delete'::text));

create policy expenses_insert_requires_permission on public.expenses as PERMISSIVE for INSERT to public
  with check (has_permission(business_id, 'expenses'::text, 'add'::text));

create policy expenses_select_requires_permission on public.expenses as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'expenses'::text, 'view'::text));

create policy expenses_update_requires_permission on public.expenses as PERMISSIVE for UPDATE to public
  using (has_permission(business_id, 'expenses'::text, 'edit'::text));

create policy inventory_select_requires_permission on public.inventory_transactions as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'inventory'::text, 'view'::text));

create policy order_items_select_requires_permission on public.order_items as PERMISSIVE for SELECT to public
  using ((order_id IN ( SELECT o.id
   FROM orders o
  WHERE has_permission(o.business_id, 'orders'::text, 'view'::text))));

create policy "Members can view their business's order payments" on public.order_payments as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM business_members
  WHERE ((business_members.business_id = order_payments.business_id) AND (business_members.user_id = auth.uid())))));

create policy orders_select_requires_permission on public.orders as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'orders'::text, 'view'::text));

create policy categories_delete_requires_permission on public.product_categories as PERMISSIVE for DELETE to public
  using (has_permission(business_id, 'products'::text, 'delete'::text));

create policy categories_insert_requires_permission on public.product_categories as PERMISSIVE for INSERT to public
  with check (has_permission(business_id, 'products'::text, 'add'::text));

create policy categories_select_requires_permission on public.product_categories as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'products'::text, 'view'::text));

create policy categories_update_requires_permission on public.product_categories as PERMISSIVE for UPDATE to public
  using (has_permission(business_id, 'products'::text, 'edit'::text));

create policy "members view products" on public.products as PERMISSIVE for SELECT to public
  using ((business_id IN ( SELECT business_members.business_id
   FROM business_members
  WHERE (business_members.user_id = auth.uid()))));

create policy "permitted delete products" on public.products as PERMISSIVE for DELETE to public
  using (has_permission(business_id, 'products'::text, 'delete'::text));

create policy "permitted update products" on public.products as PERMISSIVE for UPDATE to public
  using (has_permission(business_id, 'products'::text, 'edit'::text));

create policy products_insert_requires_permission on public.products as PERMISSIVE for INSERT to public
  with check (has_permission(business_id, 'products'::text, 'add'::text));

create policy "own profile read" on public.profiles as PERMISSIVE for SELECT to public
  using ((id = auth.uid()));

create policy "own profile update" on public.profiles as PERMISSIVE for UPDATE to public
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create policy "team members see each other profiles" on public.profiles as PERMISSIVE for SELECT to public
  using ((id IN ( SELECT bm2.user_id
   FROM (business_members bm1
     JOIN business_members bm2 ON ((bm1.business_id = bm2.business_id)))
  WHERE (bm1.user_id = auth.uid()))));

create policy "Members can view their business's refunds" on public.refunds as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM business_members bm
  WHERE ((bm.business_id = refunds.business_id) AND (bm.user_id = auth.uid())))));

create policy "Members can view return credit allocations" on public.return_credit_allocations as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM business_members bm
  WHERE ((bm.business_id = return_credit_allocations.business_id) AND (bm.user_id = auth.uid())))));

create policy return_items_select_business_members on public.return_items as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM (returns r
     JOIN business_members bm ON ((bm.business_id = r.business_id)))
  WHERE ((r.id = return_items.return_id) AND (bm.user_id = auth.uid())))));

create policy return_items_select_requires_permission on public.return_items as PERMISSIVE for SELECT to public
  using ((return_id IN ( SELECT r.id
   FROM returns r
  WHERE has_permission(r.business_id, 'returns'::text, 'view'::text))));

create policy returns_select_business_members on public.returns as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM business_members
  WHERE ((business_members.business_id = returns.business_id) AND (business_members.user_id = auth.uid())))));

create policy returns_select_requires_permission on public.returns as PERMISSIVE for SELECT to public
  using (has_permission(business_id, 'returns'::text, 'view'::text));

create policy "member reads subscription" on public.subscriptions as PERMISSIVE for SELECT to public
  using ((business_id IN ( SELECT business_members.business_id
   FROM business_members
  WHERE (business_members.user_id = auth.uid()))));

create policy "platform admins see all subscriptions" on public.subscriptions as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_platform_admin = true)))));

create policy "Business logos are publicly readable" on storage.objects as PERMISSIVE for SELECT to public
  using ((bucket_id = 'business-logos'::text));

create policy "Members can update their business logo" on storage.objects as PERMISSIVE for UPDATE to public
  using (((bucket_id = 'business-logos'::text) AND (EXISTS ( SELECT 1
   FROM business_members
  WHERE ((business_members.user_id = auth.uid()) AND ((business_members.business_id)::text = (storage.foldername(objects.name))[1]))))));

create policy "Members can upload their business logo" on storage.objects as PERMISSIVE for INSERT to public
  with check (((bucket_id = 'business-logos'::text) AND (EXISTS ( SELECT 1
   FROM business_members
  WHERE ((business_members.user_id = auth.uid()) AND ((business_members.business_id)::text = (storage.foldername(objects.name))[1]))))));

-- ===== Triggers =====

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_set_order_cancelled_by BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_order_cancelled_by();
CREATE TRIGGER trg_set_order_created_by BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION set_order_created_by();
CREATE TRIGGER trg_prevent_self_admin_elevation BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_self_admin_elevation();

-- ===== Storage buckets =====

insert into storage.buckets (id, name, public) values ('business-logos', 'business-logos', t) on conflict (id) do nothing;

-- ===== Grants =====

revoke all on all tables in schema public from anon, authenticated;

revoke execute on all functions in schema public from anon, public;

grant execute on all functions in schema public to authenticated;

revoke execute on function business_subscription_active(uuid) from authenticated;
revoke execute on function handle_new_user() from authenticated;
revoke execute on function prevent_self_admin_elevation() from authenticated;
revoke execute on function set_order_cancelled_by() from authenticated;
revoke execute on function set_order_created_by() from authenticated;

grant DELETE, INSERT, SELECT, UPDATE on public.active_sessions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.active_sessions to service_role;
grant DELETE, INSERT, SELECT, UPDATE on public.business_invitations to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.business_invitations to service_role;
grant SELECT on public.business_members to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.business_members to service_role;
grant SELECT on public.businesses to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.businesses to service_role;
grant SELECT on public.customer_payments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.customer_payments to service_role;
grant DELETE, INSERT, SELECT, UPDATE on public.customers to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.customers to service_role;
grant DELETE, INSERT, SELECT, UPDATE on public.expenses to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.expenses to service_role;
grant SELECT on public.inventory_transactions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.inventory_transactions to service_role;
grant SELECT on public.order_items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.order_items to service_role;
grant SELECT on public.order_payments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.order_payments to service_role;
grant SELECT on public.orders to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.orders to service_role;
grant DELETE, INSERT, SELECT, UPDATE on public.product_categories to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.product_categories to service_role;
grant DELETE, INSERT, SELECT on public.products to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.products to service_role;
grant SELECT on public.profiles to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.profiles to service_role;
grant SELECT on public.refunds to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.refunds to service_role;
grant SELECT on public.return_credit_allocations to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.return_credit_allocations to service_role;
grant SELECT on public.return_items to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.return_items to service_role;
grant SELECT on public.returns to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.returns to service_role;
grant SELECT on public.subscriptions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.subscriptions to service_role;

grant UPDATE (address, category, currency, logo_url, name, phone, updated_at) on public.businesses to authenticated;
grant UPDATE (category_id, cost_price, description, is_active, low_stock_threshold, name, pack_price, selling_price, sku, updated_at) on public.products to authenticated;
grant UPDATE (full_name, updated_at) on public.profiles to authenticated;
