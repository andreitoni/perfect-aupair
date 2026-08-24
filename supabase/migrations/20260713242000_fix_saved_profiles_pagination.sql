-- Return only viewable, unblocked saved profiles before application pagination.
-- The hard ceiling also prevents an account from turning /saved into an
-- unbounded database/serialization workload.

create or replace function public.enforce_profile_favorite_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select pg_catalog.count(*)
    from public.profile_favorites favorite
    where favorite.user_id = new.user_id
  ) >= 500 then
    raise exception 'Saved profile limit reached' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_profile_favorite_limit()
from public, anon, authenticated, service_role;

drop trigger if exists enforce_profile_favorite_limit_trigger
on public.profile_favorites;
create trigger enforce_profile_favorite_limit_trigger
before insert on public.profile_favorites
for each row execute function public.enforce_profile_favorite_limit();

create or replace function public.get_saved_public_profiles()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'favorite', pg_catalog.jsonb_build_object(
          'id', favorite.id,
          'profile_id', favorite.profile_id,
          'created_at', favorite.created_at
        ),
        'profile', to_jsonb(public_profile)
      )
      order by favorite.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select saved.id, saved.profile_id, saved.created_at
    from public.profile_favorites saved
    where saved.user_id = (select auth.uid())
      and not public.profile_pair_blocked((select auth.uid()), saved.profile_id)
    order by saved.created_at desc
    limit 500
  ) favorite
  cross join lateral public.get_public_profile(favorite.profile_id) public_profile;
$$;

revoke all on function public.get_saved_public_profiles()
from public, anon, authenticated, service_role;
grant execute on function public.get_saved_public_profiles()
to authenticated;
