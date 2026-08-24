-- Keep profile-view interest notifications factual, eligible, and atomic.
-- A viewer can trigger at most ten first-view nudges in a rolling day even
-- when many profile pages are requested concurrently.

create or replace function public.record_profile_view(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := (select auth.uid());
  v_viewer_type text;
  v_target_type text;
  v_inserted boolean := false;
  v_recent_nudge_count integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_viewer_id is null
    or p_profile_id is null
    or v_viewer_id = p_profile_id
  then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-view-nudge:' || v_viewer_id::text,
      0
    )
  );

  select profile.account_type into v_viewer_type
  from public.profiles profile
  where profile.id = v_viewer_id
    and public.public_profile_is_eligible(profile.id, true);

  select profile.account_type into v_target_type
  from public.profiles profile
  where profile.id = p_profile_id
    and public.public_profile_is_eligible(profile.id, true);

  if v_viewer_type is null
    or v_target_type is null
    or v_viewer_type = v_target_type
    or public.profile_pair_blocked(v_viewer_id, p_profile_id)
  then
    return false;
  end if;

  insert into public.profile_views (
    viewer_id,
    profile_id,
    first_viewed_at,
    last_viewed_at,
    view_count
  ) values (
    v_viewer_id,
    p_profile_id,
    v_now,
    v_now,
    1
  )
  on conflict (viewer_id, profile_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    update public.profile_views
    set
      last_viewed_at = v_now,
      view_count = least(public.profile_views.view_count + 1, 2147483647)
    where viewer_id = v_viewer_id
      and profile_id = p_profile_id;

    return false;
  end if;

  if v_viewer_type <> 'family' or v_target_type <> 'au_pair' then
    return false;
  end if;

  if exists (
    select 1
    from public.conversations conversation
    where conversation.family_id = v_viewer_id
      and conversation.au_pair_id = p_profile_id
  ) or exists (
    select 1
    from public.profile_favorites favorite
    where favorite.user_id = v_viewer_id
      and favorite.profile_id = p_profile_id
  ) then
    return false;
  end if;

  select pg_catalog.count(*)::integer
  into v_recent_nudge_count
  from public.profile_views view_event
  join public.profiles target on target.id = view_event.profile_id
  where view_event.viewer_id = v_viewer_id
    and target.account_type = 'au_pair'
    and view_event.first_viewed_at >= v_now - interval '24 hours';

  return v_recent_nudge_count <= 10;
end;
$$;

revoke all on function public.record_profile_view(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_profile_view(uuid)
to authenticated;
