-- Pending/rejected viewers must not gain private story paths merely by using
-- the authenticated key directly. Owners and admins retain moderation access.

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
          viewer_profile.onboarding_completed = true
          and viewer_profile.suspended_at is null
          and viewer_profile.deletion_requested_at is null
          and viewer_profile.deletion_scheduled_at is null
          and viewer_profile.content_moderation_status = 'approved'
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

drop policy if exists "Public can view approved active profile stories"
on public.profile_stories;
create policy "Guests can view approved active profile story metadata"
on public.profile_stories for select to anon
using (
  public.database_feature_flag_enabled('stories')
  and expires_at > pg_catalog.now()
  and content_moderation_status = 'approved'
  and public.public_profile_is_eligible(profile_id, true)
);
create policy "Eligible users can view approved active profile stories"
on public.profile_stories for select to authenticated
using (
  public.database_feature_flag_enabled('stories')
  and expires_at > pg_catalog.now()
  and content_moderation_status = 'approved'
  and public.public_profile_is_eligible(profile_id, true)
  and public.can_view_profile_story(profile_id)
);

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
      and story.content_moderation_status = 'approved'
      and public.public_profile_is_eligible(story.profile_id, true)
      and (
        story.profile_id = (select auth.uid())
        or public.can_view_profile_story(story.profile_id)
      )
  )
);

drop policy if exists "Users can upload own profile story files"
on storage.objects;
create policy "Users can upload own profile story files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.public_profile_is_eligible((select auth.uid()), true)
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create or replace function public.get_active_story_cards(p_account_type text)
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
    case
      when (select auth.uid()) is null then null
      else story.storage_path
    end,
    story.created_at,
    story.expires_at
  from public.profile_stories story
  join public.profiles owner_profile on owner_profile.id = story.profile_id
  where public.database_feature_flag_enabled('stories')
    and p_account_type in ('family', 'au_pair')
    and owner_profile.account_type = p_account_type
    and story.expires_at > pg_catalog.now()
    and story.content_moderation_status = 'approved'
    and public.public_profile_is_eligible(owner_profile.id, true)
    and (
      (select auth.uid()) is null
      or public.can_view_profile_story(owner_profile.id)
    )
  order by story.created_at desc
  limit 20;
$$;

revoke all on function public.get_active_story_cards(text)
from public, anon, authenticated, service_role;
grant execute on function public.get_active_story_cards(text)
to anon, authenticated;

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
    and story.content_moderation_status = 'approved'
    and public.public_profile_is_eligible(owner_profile.id, true)
    and public.can_view_profile_story(owner_profile.id)
  limit 1;
$$;

revoke all on function public.get_public_story(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_story(uuid)
to authenticated;
