-- Apply AI moderation results only to the exact resource version that was
-- claimed, and keep private owner access separate from public story eligibility.

create or replace function public.apply_ai_moderation_resource_result(
  p_claim_token uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_claim public.ai_moderation_resource_claims%rowtype;
  v_current_version text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_claim_token is null
    or p_resource_id is null
    or p_resource_type not in ('profile', 'story')
    or p_status not in ('pending', 'approved')
    or p_reason is null
    or pg_catalog.char_length(p_reason) not between 1 and 1000
  then
    return false;
  end if;

  select claim.*
  into v_claim
  from public.ai_moderation_resource_claims claim
  where claim.claim_token = p_claim_token
    and claim.resource_type = p_resource_type
    and claim.resource_id = p_resource_id
    and claim.completed_at is null
    and claim.claimed_until > v_now
  for update;

  if not found then
    return false;
  end if;

  if p_resource_type = 'profile' then
    perform 1
    from public.profiles profile
    where profile.id = p_resource_id
      and profile.content_moderation_status = 'pending'
      and profile.content_moderation_reviewed_by is null
      and coalesce(profile.is_admin, false) = false
    for update;

    if not found then
      return false;
    end if;

    select pg_catalog.md5(pg_catalog.concat_ws(
      pg_catalog.chr(31),
      coalesce(profile.full_name, ''),
      coalesce(profile.first_name, ''),
      coalesce(profile.last_name, ''),
      coalesce(profile.bio, ''),
      coalesce(profile.children_info, ''),
      coalesce(profile.accommodation_info, ''),
      coalesce(profile.expectations, ''),
      coalesce((
        select pg_catalog.string_agg(
          photo.storage_path,
          pg_catalog.chr(31)
          order by photo.storage_path
        )
        from public.profile_photos photo
        where photo.profile_id = profile.id
      ), '')
    ))
    into v_current_version
    from public.profiles profile
    where profile.id = p_resource_id;

    if v_current_version is distinct from v_claim.resource_version then
      return false;
    end if;

    update public.profiles
    set
      content_moderation_status = p_status,
      content_moderation_reviewed_at = case
        when p_status = 'approved' then v_now
        else null
      end,
      content_moderation_reviewed_by = null,
      content_moderation_reason = p_reason
    where id = p_resource_id
      and content_moderation_status = 'pending'
      and content_moderation_reviewed_by is null;
  else
    perform 1
    from public.profile_stories story
    where story.id = p_resource_id
      and story.content_moderation_status = 'pending'
      and story.content_moderation_reviewed_by is null
      and story.expires_at > v_now
    for update;

    if not found then
      return false;
    end if;

    select pg_catalog.md5(story.storage_path)
    into v_current_version
    from public.profile_stories story
    where story.id = p_resource_id;

    if v_current_version is distinct from v_claim.resource_version then
      return false;
    end if;

    update public.profile_stories
    set
      content_moderation_status = p_status,
      content_moderation_reviewed_at = case
        when p_status = 'approved' then v_now
        else null
      end,
      content_moderation_reviewed_by = null,
      content_moderation_reason = p_reason
    where id = p_resource_id
      and content_moderation_status = 'pending'
      and content_moderation_reviewed_by is null
      and expires_at > v_now;
  end if;

  return found;
end;
$$;

revoke all on function public.apply_ai_moderation_resource_result(
  uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.apply_ai_moderation_resource_result(
  uuid, text, uuid, text, text
) to service_role;

create or replace function public.can_view_profile_story(
  p_owner_profile_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles viewer_profile
    join public.profiles owner_profile
      on owner_profile.id = p_owner_profile_id
    where viewer_profile.id = (select auth.uid())
      and (
        coalesce(viewer_profile.is_admin, false)
        or (
          public.public_profile_is_eligible(viewer_profile.id, true)
          and (
            viewer_profile.id = owner_profile.id
            or viewer_profile.account_type <> owner_profile.account_type
          )
        )
      )
      and not public.profile_pair_blocked(
        viewer_profile.id,
        owner_profile.id
      )
  );
$$;

revoke all on function public.can_view_profile_story(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.can_view_profile_story(uuid)
to authenticated, service_role;

drop policy if exists "Authenticated users can view eligible profile story files"
on storage.objects;
create policy "Authenticated users can view eligible profile story files"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-stories'
  and public.database_feature_flag_enabled('stories')
  and exists (
    select 1
    from public.profile_stories story
    where story.storage_path = storage.objects.name
      and story.expires_at > pg_catalog.now()
      and (
        story.profile_id = (select auth.uid())
        or (
          story.content_moderation_status = 'approved'
          and public.public_profile_is_eligible(story.profile_id, true)
          and public.can_view_profile_story(story.profile_id)
        )
      )
  )
);

create or replace function public.get_public_story(p_story_id uuid)
returns table (
  id uuid,
  profile_id uuid,
  full_name text,
  account_type text,
  city text,
  country text,
  storage_path text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    story.id,
    owner_profile.id,
    owner_profile.full_name,
    owner_profile.account_type,
    owner_profile.city,
    owner_profile.country,
    story.storage_path,
    story.created_at,
    story.expires_at
  from public.profile_stories story
  join public.profiles owner_profile on owner_profile.id = story.profile_id
  where public.database_feature_flag_enabled('stories')
    and story.id = p_story_id
    and story.expires_at > pg_catalog.now()
    and (
      story.profile_id = (select auth.uid())
      or (
        story.content_moderation_status = 'approved'
        and public.public_profile_is_eligible(owner_profile.id, true)
        and public.can_view_profile_story(owner_profile.id)
      )
    )
  limit 1;
$$;

revoke all on function public.get_public_story(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_story(uuid)
to authenticated;
