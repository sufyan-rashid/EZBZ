-- New RPC: team members list with email, so business owners can see who's
-- actually been added (profiles has no email column; it only lives in
-- auth.users, which PostgREST can't join directly from the client).
create or replace function public.get_team_members(p_business_id uuid)
returns table(id uuid, role text, permissions jsonb, user_id uuid, full_name text, email text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
