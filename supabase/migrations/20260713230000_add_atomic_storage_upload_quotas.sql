create table if not exists public.storage_upload_usage_events (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null check (char_length(bucket_id) between 3 and 80),
  object_name text not null check (char_length(object_name) between 3 and 1024),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  unique (bucket_id, object_name)
);

alter table public.storage_upload_usage_events enable row level security;

create index if not exists storage_upload_usage_uploader_bucket_created_idx
on public.storage_upload_usage_events (uploader_id, bucket_id, created_at desc);

revoke all on table public.storage_upload_usage_events from public, anon, authenticated;
grant select, insert, update, delete on table public.storage_upload_usage_events to service_role;

create or replace function public.storage_object_size_bytes(p_metadata jsonb)
returns bigint
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_metadata ->> 'size', '') ~ '^[0-9]{1,12}$'
      then (p_metadata ->> 'size')::bigint
    else 0::bigint
  end;
$$;

revoke all on function public.storage_object_size_bytes(jsonb) from public, anon;
grant execute on function public.storage_object_size_bytes(jsonb) to authenticated, service_role;

create or replace function public.reserve_storage_upload_quota(
  p_bucket_id text,
  p_object_name text,
  p_size_bytes bigint,
  p_window interval,
  p_window_object_limit integer,
  p_window_byte_limit bigint,
  p_daily_byte_limit bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_window_count integer;
  v_window_bytes bigint;
  v_daily_bytes bigint;
begin
  if v_user_id is null then
    return false;
  end if;

  if p_bucket_id not in (
    'profile-photos',
    'profile-stories',
    'profile-videos',
    'message-photos',
    'message-videos',
    'message-audio',
    'verification-selfies'
  ) then
    return false;
  end if;

  if p_object_name is null
    or char_length(p_object_name) < 3
    or char_length(p_object_name) > 1024
    or p_size_bytes is null
    or p_size_bytes < 1
    or p_window is null
    or p_window <= interval '0 seconds'
    or p_window > interval '24 hours'
    or p_window_object_limit is null
    or p_window_object_limit < 1
    or p_window_byte_limit is null
    or p_window_byte_limit < 1
    or p_daily_byte_limit is null
    or p_daily_byte_limit < p_window_byte_limit
  then
    return false;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.onboarding_completed = true
      and coalesce(p.is_admin, false) = false
      and p.deletion_requested_at is null
      and (
        p.suspended_at is null
        or (
          p.suspended_until is not null
          and p.suspended_until <= v_now
        )
      )
  ) then
    return false;
  end if;

  if not coalesce(
    (select f.enabled from public.feature_flags f where f.key = 'uploads'),
    false
  ) then
    return false;
  end if;

  if p_bucket_id = 'profile-stories' and not coalesce(
    (select f.enabled from public.feature_flags f where f.key = 'stories'),
    false
  ) then
    return false;
  end if;

  if p_bucket_id = 'profile-videos' and not coalesce(
    (select f.enabled from public.feature_flags f where f.key = 'profile_videos'),
    false
  ) then
    return false;
  end if;

  if p_bucket_id in ('message-photos', 'message-videos', 'message-audio')
    and not coalesce(
      (
        select f.enabled
        from public.feature_flags f
        where f.key = 'message_media_uploads'
      ),
      false
    )
  then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'perfect-aupair:storage-upload:' || v_user_id::text || ':' || p_bucket_id,
      0
    )
  );

  if exists (
    select 1
    from public.storage_upload_usage_events e
    where e.uploader_id = v_user_id
      and e.bucket_id = p_bucket_id
      and e.object_name = p_object_name
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.storage_upload_usage_events e
    where e.bucket_id = p_bucket_id
      and e.object_name = p_object_name
      and e.uploader_id <> v_user_id
  ) then
    return false;
  end if;

  delete from public.storage_upload_usage_events e
  where e.uploader_id = v_user_id
    and e.bucket_id = p_bucket_id
    and e.created_at < v_now - interval '30 days';

  select count(*)::integer, coalesce(sum(e.size_bytes), 0)::bigint
  into v_window_count, v_window_bytes
  from public.storage_upload_usage_events e
  where e.uploader_id = v_user_id
    and e.bucket_id = p_bucket_id
    and e.created_at > v_now - p_window;

  select coalesce(sum(e.size_bytes), 0)::bigint
  into v_daily_bytes
  from public.storage_upload_usage_events e
  where e.uploader_id = v_user_id
    and e.bucket_id = p_bucket_id
    and e.created_at > v_now - interval '24 hours';

  if v_window_count >= p_window_object_limit
    or v_window_bytes + p_size_bytes > p_window_byte_limit
    or v_daily_bytes + p_size_bytes > p_daily_byte_limit
  then
    return false;
  end if;

  insert into public.storage_upload_usage_events (
    uploader_id,
    bucket_id,
    object_name,
    size_bytes
  )
  values (
    v_user_id,
    p_bucket_id,
    p_object_name,
    p_size_bytes
  );

  return true;
end;
$$;

revoke all on function public.reserve_storage_upload_quota(
  text,
  text,
  bigint,
  interval,
  integer,
  bigint,
  bigint
) from public, anon;

grant execute on function public.reserve_storage_upload_quota(
  text,
  text,
  bigint,
  interval,
  integer,
  bigint,
  bigint
) to authenticated, service_role;

update storage.buckets
set public = false
where id = 'profile-stories';

update storage.buckets
set public = false
where id = 'profile-photos';

drop policy if exists "Anyone can view profile photo files" on storage.objects;
drop policy if exists "Users can view their own profile photo files"
on storage.objects;

create policy "Users can view their own profile photo files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Anyone can view profile story files" on storage.objects;
drop policy if exists "Authenticated users can view eligible profile story files"
on storage.objects;

create policy "Authenticated users can view eligible profile story files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-stories'
  and exists (
    select 1
    from public.profile_stories s
    join public.profiles owner_profile
      on owner_profile.id = s.profile_id
    where s.storage_path = name
      and (
        s.profile_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles viewer_profile
          where viewer_profile.id = (select auth.uid())
            and viewer_profile.onboarding_completed = true
            and viewer_profile.deletion_requested_at is null
            and (
              viewer_profile.suspended_at is null
              or (
                viewer_profile.suspended_until is not null
                and viewer_profile.suspended_until <= now()
              )
            )
            and (
              coalesce(viewer_profile.is_admin, false) = true
              or (
                viewer_profile.account_type <> owner_profile.account_type
                and exists (
                  select 1
                  from public.profile_photos viewer_photo
                  where viewer_photo.profile_id = viewer_profile.id
                )
              )
            )
            and s.expires_at > now()
            and s.content_moderation_status = 'approved'
            and owner_profile.onboarding_completed = true
            and owner_profile.deletion_requested_at is null
            and coalesce(owner_profile.is_admin, false) = false
            and owner_profile.content_moderation_status = 'approved'
            and (
              owner_profile.suspended_at is null
              or (
                owner_profile.suspended_until is not null
                and owner_profile.suspended_until <= now()
              )
            )
            and not public.profile_pair_blocked(
              viewer_profile.id,
              owner_profile.id
            )
        )
      )
  )
);

drop policy if exists "Users can upload their own profile photo files"
on storage.objects;

create policy "Users can upload their own profile photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata),
    interval '10 minutes',
    20,
    50 * 1024 * 1024,
    100 * 1024 * 1024
  )
);

drop policy if exists "Users can upload their own profile story files"
on storage.objects;
drop policy if exists "Users can upload own profile story files"
on storage.objects;

create policy "Users can upload own profile story files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata),
    interval '10 minutes',
    8,
    40 * 1024 * 1024,
    100 * 1024 * 1024
  )
);

drop policy if exists "Users can upload own profile video files"
on storage.objects;

create policy "Users can upload own profile video files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata),
    interval '1 hour',
    3,
    180 * 1024 * 1024,
    180 * 1024 * 1024
  )
);

drop policy if exists "Conversation participants can upload message photo files"
on storage.objects;

create policy "Conversation participants can upload message photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-photos'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
      and not public.profile_pair_blocked(c.family_id, c.au_pair_id)
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata),
    interval '10 minutes',
    40,
    100 * 1024 * 1024,
    250 * 1024 * 1024
  )
);

drop policy if exists "Conversation participants can upload message video files"
on storage.objects;

create policy "Conversation participants can upload message video files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-videos'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
      and not public.profile_pair_blocked(c.family_id, c.au_pair_id)
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata),
    interval '1 hour',
    6,
    500 * 1024 * 1024,
    500 * 1024 * 1024
  )
);

drop policy if exists "Conversation participants can upload message audio files"
on storage.objects;

create policy "Conversation participants can upload message audio files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-audio'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
      and not public.profile_pair_blocked(c.family_id, c.au_pair_id)
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata),
    interval '1 hour',
    30,
    75 * 1024 * 1024,
    100 * 1024 * 1024
  )
);

drop policy if exists "Users can upload own verification selfies"
on storage.objects;

create policy "Users can upload own verification selfies"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata),
    interval '1 hour',
    10,
    30 * 1024 * 1024,
    30 * 1024 * 1024
  )
);

-- The old implementation counted only objects that still existed. Keeping it
-- callable would invite future policies to accidentally restore delete/reupload
-- quota resets.
revoke all on function public.storage_upload_rate_limit_ok(
  text,
  text,
  interval,
  integer
) from public, anon, authenticated;
