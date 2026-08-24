create or replace function public.is_profile_publicly_browsable(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.onboarding_completed = true
      and p.public_slug is not null
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and p.content_moderation_status = 'approved'
      and coalesce(p.is_admin, false) = false
      and exists (
        select 1
        from public.profile_photos ph
        where ph.profile_id = p.id
      )
  );
$$;

revoke all on function public.is_profile_publicly_browsable(uuid) from public;
grant execute on function public.is_profile_publicly_browsable(uuid) to anon, authenticated, service_role;

drop policy if exists "Public can read active profile video metadata"
on public.profile_videos;

drop policy if exists "Public can read public profile video metadata"
on public.profile_videos;

create policy "Public can read public profile video metadata"
on public.profile_videos
for select
to anon, authenticated
using (public.is_profile_publicly_browsable(profile_id));

drop policy if exists "Users can read own profile video metadata"
on public.profile_videos;

create policy "Users can read own profile video metadata"
on public.profile_videos
for select
to authenticated
using (profile_id = (select auth.uid()));

create or replace function public.can_view_profile_video_file(
  p_storage_path text,
  p_viewer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_videos pv
    join public.profiles owner_profile
      on owner_profile.id = pv.profile_id
    left join public.profiles viewer_profile
      on viewer_profile.id = p_viewer_id
    where pv.storage_path = p_storage_path
      and owner_profile.onboarding_completed = true
      and owner_profile.suspended_at is null
      and owner_profile.deletion_requested_at is null
      and coalesce(owner_profile.is_admin, false) = false
      and (
        pv.profile_id = p_viewer_id
        or coalesce(viewer_profile.is_admin, false) = true
        or (
          public.is_profile_publicly_browsable(pv.profile_id)
          and viewer_profile.onboarding_completed = true
          and viewer_profile.suspended_at is null
          and viewer_profile.deletion_requested_at is null
          and viewer_profile.account_type <> owner_profile.account_type
        )
      )
  );
$$;

revoke all on function public.can_view_profile_video_file(text, uuid) from public;
grant execute on function public.can_view_profile_video_file(text, uuid) to authenticated, service_role;

drop policy if exists "Authenticated users can view matched profile video files"
on storage.objects;

create policy "Authenticated users can view matched profile video files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-videos'
  and public.can_view_profile_video_file(storage.objects.name, (select auth.uid()))
);
