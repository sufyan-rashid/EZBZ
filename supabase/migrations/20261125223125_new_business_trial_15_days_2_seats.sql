
-- New businesses get a 15-day free trial with 2 seats (was 7 days, 3 seats).
alter table public.subscriptions alter column max_users set default 2;

-- Same function as before; only the trial length and seat count changed.
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
  values (v_business_id, 'monthly', 'trial', 0, coalesce(p_currency, 'PKR'), now(), now() + interval '15 days', 2);

  return v_business_id;
end;
$function$;
