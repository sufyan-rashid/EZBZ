
-- A promoted co-owner got every owner permission except Data (export).
create or replace function public.promote_to_co_owner(p_member_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;

update public.business_members
set permissions = permissions || '{"data": {"view": true}}'::jsonb
where role = 'Owner' and not (permissions ? 'data');

-- Trigger functions and the subscription helper are only ever invoked by the
-- database itself, never as API calls.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.prevent_self_admin_elevation() from authenticated;
revoke execute on function public.set_order_cancelled_by() from authenticated;
revoke execute on function public.set_order_created_by() from authenticated;
revoke execute on function public.business_subscription_active(uuid) from authenticated;
