insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-videos',
  'profile-videos',
  false,
  62914560,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.profile_videos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  duration_seconds numeric(6, 2) not null,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_videos_one_per_profile unique (profile_id),
  constraint profile_videos_mime_type_valid check (
    mime_type in ('video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v')
  ),
  constraint profile_videos_size_valid check (
    size_bytes > 0 and size_bytes <= 62914560
  ),
  constraint profile_videos_duration_valid check (
    duration_seconds > 0 and duration_seconds <= 60.5
  ),
  constraint profile_videos_dimensions_valid check (
    (width is null or width > 0)
    and (height is null or height > 0)
  )
);

alter table public.profile_videos enable row level security;

create index if not exists profile_videos_profile_id_idx
on public.profile_videos (profile_id);

drop trigger if exists profile_videos_update_updated_at on public.profile_videos;
create trigger profile_videos_update_updated_at
before update on public.profile_videos
for each row
execute function public.update_updated_at();

create policy "Public can read active profile video metadata"
on public.profile_videos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_videos.profile_id
      and p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
  )
);

create policy "Users can insert own profile video"
on public.profile_videos
for insert
to authenticated
with check (profile_id = (select auth.uid()));

create policy "Users can update own profile video"
on public.profile_videos
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Users can delete own profile video"
on public.profile_videos
for delete
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "Authenticated users can view matched profile video files" on storage.objects;
create policy "Authenticated users can view matched profile video files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-videos'
  and exists (
    select 1
    from public.profile_videos pv
    join public.profiles owner_profile
      on owner_profile.id = pv.profile_id
    left join public.profiles viewer_profile
      on viewer_profile.id = (select auth.uid())
    where pv.storage_path = storage.objects.name
      and owner_profile.onboarding_completed = true
      and owner_profile.suspended_at is null
      and owner_profile.deletion_requested_at is null
      and coalesce(owner_profile.is_admin, false) = false
      and (
        pv.profile_id = (select auth.uid())
        or coalesce(viewer_profile.is_admin, false) = true
        or (
          viewer_profile.onboarding_completed = true
          and viewer_profile.suspended_at is null
          and viewer_profile.deletion_requested_at is null
          and viewer_profile.account_type <> owner_profile.account_type
        )
      )
  )
);

drop policy if exists "Users can upload own profile video files" on storage.objects;
create policy "Users can upload own profile video files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update own profile video files" on storage.objects;
create policy "Users can update own profile video files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete own profile video files" on storage.objects;
create policy "Users can delete own profile video files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

grant select
on table public.profile_videos
to anon, authenticated;

grant insert, update, delete
on table public.profile_videos
to authenticated;

grant select, insert, update, delete
on table public.profile_videos
to service_role;
