drop function if exists public.record_profile_view(uuid);

create or replace function public.record_profile_view(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer record;
  v_target record;
  v_inserted boolean := false;
  v_recent_nudge_count integer := 0;
begin
  if v_viewer_id is null or p_profile_id is null or v_viewer_id = p_profile_id then
    return false;
  end if;

  select
    p.id,
    p.account_type,
    p.onboarding_completed,
    p.suspended_at,
    p.deletion_requested_at,
    p.content_moderation_status,
    p.is_admin
  into v_viewer
  from public.profiles p
  where p.id = v_viewer_id;

  select
    p.id,
    p.account_type,
    p.onboarding_completed,
    p.suspended_at,
    p.deletion_requested_at,
    p.content_moderation_status,
    p.is_admin,
    p.public_slug
  into v_target
  from public.profiles p
  where p.id = p_profile_id;

  if v_viewer.id is null or v_target.id is null then
    return false;
  end if;

  if coalesce(v_viewer.is_admin, false) or coalesce(v_target.is_admin, false) then
    return false;
  end if;

  if not coalesce(v_viewer.onboarding_completed, false)
    or not coalesce(v_target.onboarding_completed, false)
    or v_viewer.account_type is null
    or v_target.account_type is null
    or v_viewer.account_type = v_target.account_type
    or v_viewer.suspended_at is not null
    or v_target.suspended_at is not null
    or v_viewer.deletion_requested_at is not null
    or v_target.deletion_requested_at is not null
    or v_target.public_slug is null
    or v_target.content_moderation_status is distinct from 'approved'
  then
    return false;
  end if;

  if public.profile_pair_blocked(v_viewer_id, p_profile_id) then
    return false;
  end if;

  insert into public.profile_views (
    viewer_id,
    profile_id,
    first_viewed_at,
    last_viewed_at,
    view_count
  )
  values (
    v_viewer_id,
    p_profile_id,
    now(),
    now(),
    1
  )
  on conflict (viewer_id, profile_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    update public.profile_views
    set
      last_viewed_at = now(),
      view_count = public.profile_views.view_count + 1
    where viewer_id = v_viewer_id
      and profile_id = p_profile_id;

    return false;
  end if;

  if v_viewer.account_type <> 'family' or v_target.account_type <> 'au_pair' then
    return false;
  end if;

  if exists (
    select 1
    from public.conversations c
    where c.family_id = v_viewer_id
      and c.au_pair_id = p_profile_id
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.profile_favorites pf
    where pf.user_id = v_viewer_id
      and pf.profile_id = p_profile_id
  ) then
    return false;
  end if;

  select count(*)::integer
  into v_recent_nudge_count
  from public.profile_views pv
  join public.profiles target
    on target.id = pv.profile_id
  where pv.viewer_id = v_viewer_id
    and target.account_type = 'au_pair'
    and pv.first_viewed_at >= now() - interval '24 hours';

  return v_recent_nudge_count <= 10;
end;
$$;

revoke all on function public.record_profile_view(uuid) from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated;
