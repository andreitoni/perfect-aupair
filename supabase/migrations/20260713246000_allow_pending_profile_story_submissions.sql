-- A profile that is still awaiting content moderation may prepare a story, but
-- neither the profile nor the story becomes public until both moderation gates
-- approve it. This keeps the upload flow usable when the moderation provider is
-- unavailable without weakening public story visibility.

create or replace function public.can_submit_profile_story()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.onboarding_completed = true
      and profile.public_slug is not null
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.deletion_scheduled_at is null
      and profile.content_moderation_status in ('pending', 'approved')
      and coalesce(profile.is_admin, false) = false
      and exists (
        select 1
        from public.profile_photos photo
        where photo.profile_id = profile.id
      )
  );
$$;

revoke all on function public.can_submit_profile_story()
from public, anon, authenticated, service_role;
grant execute on function public.can_submit_profile_story()
to authenticated, service_role;

drop policy if exists "Eligible users can insert their own profile stories"
on public.profile_stories;
create policy "Eligible users can insert their own profile stories"
on public.profile_stories for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and public.database_feature_flag_enabled('stories')
  and public.database_feature_flag_enabled('uploads')
  and public.can_submit_profile_story()
);

drop policy if exists "Users can upload own profile story files"
on storage.objects;
create policy "Users can upload own profile story files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.can_submit_profile_story()
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);
