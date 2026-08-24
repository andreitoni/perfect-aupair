-- Keep saved-profile reads and writes bounded under concurrency. The page RPC
-- returns only the requested slice plus an eligible/unblocked total, while the
-- insert trigger serializes each user's hard-cap check.

create or replace function public.enforce_profile_favorite_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-favorite-limit:' || new.user_id::text,
      0
    )
  );

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

drop function if exists public.get_saved_public_profiles();
drop function if exists public.get_saved_public_profiles(integer, integer);

create function public.get_saved_public_profiles(
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 500);
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.profile_favorites saved
  where saved.user_id = v_user_id
    and not public.profile_pair_blocked(v_user_id, saved.profile_id)
    and exists (
      select 1
      from public.get_public_profile(saved.profile_id)
    );

  if v_total = 0 then
    v_offset := 0;
  elsif v_offset >= v_total then
    v_offset := ((v_total - 1) / v_limit) * v_limit;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'favorite', pg_catalog.jsonb_build_object(
          'id', favorite.id,
          'profile_id', favorite.profile_id,
          'created_at', favorite.created_at
        ),
        'profile', favorite.profile
      )
      order by favorite.created_at desc, favorite.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      saved.id,
      saved.profile_id,
      saved.created_at,
      to_jsonb(public_profile) as profile
    from public.profile_favorites saved
    cross join lateral public.get_public_profile(saved.profile_id) public_profile
    where saved.user_id = v_user_id
      and not public.profile_pair_blocked(v_user_id, saved.profile_id)
    order by saved.created_at desc, saved.id desc
    limit v_limit
    offset v_offset
  ) favorite;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function public.get_saved_public_profiles(integer, integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_saved_public_profiles(integer, integer)
to authenticated;
