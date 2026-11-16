-- New RPC: lists every business for the admin panel's status-grouped
-- overview (Trial / Active / Expired / Cancelled sections), same row shape
-- as admin_find_business but without a search filter or row limit.
create or replace function public.admin_list_all_businesses()
returns table(business_id uuid, business_name text, owner_name text, owner_email text, plan text, status text, max_users integer, expiry_date timestamptz, member_count bigint)
language plpgsql
security definer
as $function$
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
$function$;
