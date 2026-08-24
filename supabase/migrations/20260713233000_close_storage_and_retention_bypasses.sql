-- Close launch-blocking upload, moderation, and retention bypasses that remained
-- reachable through direct authenticated Supabase calls.

alter table public.storage_upload_usage_events
  add column if not exists committed_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists storage_upload_usage_bucket_live_idx
on public.storage_upload_usage_events (bucket_id, deleted_at, committed_at);

-- Remove every policy that depended on the earlier caller-configurable quota
-- function before replacing it with a fixed server-side contract.
drop policy if exists "Users can upload their own profile photo files"
on storage.objects;
drop policy if exists "Users can upload own profile story files"
on storage.objects;
drop policy if exists "Users can upload own profile video files"
on storage.objects;
drop policy if exists "Conversation participants can upload message photo files"
on storage.objects;
drop policy if exists "Conversation participants can upload message video files"
on storage.objects;
drop policy if exists "Conversation participants can upload message audio files"
on storage.objects;
drop policy if exists "Users can upload own verification selfies"
on storage.objects;

revoke all on function public.reserve_storage_upload_quota(
  text, text, bigint, interval, integer, bigint, bigint
) from public, anon, authenticated, service_role;
drop function public.reserve_storage_upload_quota(
  text, text, bigint, interval, integer, bigint, bigint
);

create function public.reserve_storage_upload_quota(
  p_bucket_id text,
  p_object_name text,
  p_size_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_folder text[];
  v_window interval;
  v_window_object_limit integer;
  v_window_byte_limit bigint;
  v_daily_object_limit integer;
  v_daily_byte_limit bigint;
  v_object_byte_limit bigint;
  v_live_object_limit integer;
  v_live_byte_limit bigint;
  v_global_live_byte_limit bigint;
  v_existing_size bigint;
  v_window_count integer;
  v_window_bytes bigint;
  v_daily_count integer;
  v_daily_bytes bigint;
  v_live_count integer;
  v_live_bytes bigint;
  v_global_live_bytes bigint;
begin
  if v_user_id is null
    or p_object_name is null
    or pg_catalog.char_length(p_object_name) not between 3 and 1024
    or p_size_bytes is null
    or p_size_bytes < 0
  then
    return false;
  end if;

  case p_bucket_id
    when 'profile-photos' then
      v_window := interval '10 minutes';
      v_window_object_limit := 20;
      v_window_byte_limit := 50 * 1024 * 1024;
      v_daily_object_limit := 100;
      v_daily_byte_limit := 100 * 1024 * 1024;
      v_object_byte_limit := 5 * 1024 * 1024;
      v_live_object_limit := 5;
      v_live_byte_limit := 25 * 1024 * 1024;
      v_global_live_byte_limit := 5::bigint * 1024 * 1024 * 1024;
    when 'profile-stories' then
      v_window := interval '10 minutes';
      v_window_object_limit := 8;
      v_window_byte_limit := 40 * 1024 * 1024;
      v_daily_object_limit := 50;
      v_daily_byte_limit := 100 * 1024 * 1024;
      v_object_byte_limit := 5 * 1024 * 1024;
      v_live_object_limit := 12;
      v_live_byte_limit := 60 * 1024 * 1024;
      v_global_live_byte_limit := 2::bigint * 1024 * 1024 * 1024;
    when 'profile-videos' then
      v_window := interval '1 hour';
      v_window_object_limit := 3;
      v_window_byte_limit := 180 * 1024 * 1024;
      v_daily_object_limit := 10;
      v_daily_byte_limit := 180 * 1024 * 1024;
      v_object_byte_limit := 60 * 1024 * 1024;
      v_live_object_limit := 1;
      v_live_byte_limit := 60 * 1024 * 1024;
      v_global_live_byte_limit := 10::bigint * 1024 * 1024 * 1024;
    when 'message-photos' then
      v_window := interval '10 minutes';
      v_window_object_limit := 40;
      v_window_byte_limit := 100 * 1024 * 1024;
      v_daily_object_limit := 250;
      v_daily_byte_limit := 250 * 1024 * 1024;
      v_object_byte_limit := 5 * 1024 * 1024;
      v_live_object_limit := 500;
      v_live_byte_limit := 1024::bigint * 1024 * 1024;
      v_global_live_byte_limit := 10::bigint * 1024 * 1024 * 1024;
    when 'message-videos' then
      v_window := interval '1 hour';
      v_window_object_limit := 6;
      v_window_byte_limit := 500 * 1024 * 1024;
      v_daily_object_limit := 30;
      v_daily_byte_limit := 500 * 1024 * 1024;
      v_object_byte_limit := 100 * 1024 * 1024;
      v_live_object_limit := 50;
      v_live_byte_limit := 2::bigint * 1024 * 1024 * 1024;
      v_global_live_byte_limit := 20::bigint * 1024 * 1024 * 1024;
    when 'message-audio' then
      v_window := interval '1 hour';
      v_window_object_limit := 30;
      v_window_byte_limit := 75 * 1024 * 1024;
      v_daily_object_limit := 120;
      v_daily_byte_limit := 100 * 1024 * 1024;
      v_object_byte_limit := 15 * 1024 * 1024;
      v_live_object_limit := 500;
      v_live_byte_limit := 500::bigint * 1024 * 1024;
      v_global_live_byte_limit := 5::bigint * 1024 * 1024 * 1024;
    when 'verification-selfies' then
      v_window := interval '1 hour';
      v_window_object_limit := 10;
      v_window_byte_limit := 30 * 1024 * 1024;
      v_daily_object_limit := 20;
      v_daily_byte_limit := 30 * 1024 * 1024;
      v_object_byte_limit := 5 * 1024 * 1024;
      v_live_object_limit := 5;
      v_live_byte_limit := 25 * 1024 * 1024;
      v_global_live_byte_limit := 2::bigint * 1024 * 1024 * 1024;
    else
      return false;
  end case;

  if p_size_bytes > v_object_byte_limit then
    return false;
  end if;

  v_folder := storage.foldername(p_object_name);

  if p_bucket_id in (
    'profile-photos',
    'profile-stories',
    'profile-videos',
    'verification-selfies'
  ) then
    if v_folder[1] is distinct from v_user_id::text then
      return false;
    end if;
  elsif
    v_folder[1] is null
    or v_folder[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not exists (
      select 1
      from public.conversations conversation
      where conversation.id = v_folder[1]::uuid
        and (
          conversation.family_id = v_user_id
          or conversation.au_pair_id = v_user_id
        )
        and not public.profile_pair_blocked(
          conversation.family_id,
          conversation.au_pair_id
        )
    )
  then
    return false;
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_user_id
      and profile.onboarding_completed = true
      and coalesce(profile.is_admin, false) = false
      and profile.deletion_requested_at is null
      and profile.deletion_scheduled_at is null
      and profile.suspended_at is null
  ) then
    return false;
  end if;

  if not coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = 'uploads'
  ), false) then
    return false;
  end if;

  if p_bucket_id = 'profile-stories' and not coalesce((
    select flag.enabled from public.feature_flags flag where flag.key = 'stories'
  ), false) then
    return false;
  end if;

  if p_bucket_id = 'profile-videos' and not coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = 'profile_videos'
  ), false) then
    return false;
  end if;

  if p_bucket_id in ('message-photos', 'message-videos', 'message-audio')
    and not coalesce((
      select flag.enabled
      from public.feature_flags flag
      where flag.key = 'message_media_uploads'
    ), false)
  then
    return false;
  end if;

  -- Serialize both the global bucket ceiling and the per-user quota.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:storage-upload-global:' || p_bucket_id,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:storage-upload:' || v_user_id::text || ':' || p_bucket_id,
      0
    )
  );

  -- Direct reservations that never became a Storage object must not consume
  -- quota forever. Committed/deleted rows remain as an immutable audit ledger.
  delete from public.storage_upload_usage_events event
  where event.bucket_id = p_bucket_id
    and event.committed_at is null
    and event.created_at < v_now - interval '1 hour';

  if exists (
    select 1
    from public.storage_upload_usage_events event
    where event.bucket_id = p_bucket_id
      and event.object_name = p_object_name
      and event.uploader_id <> v_user_id
  ) then
    return false;
  end if;

  select event.size_bytes
  into v_existing_size
  from public.storage_upload_usage_events event
  where event.uploader_id = v_user_id
    and event.bucket_id = p_bucket_id
    and event.object_name = p_object_name
    and event.deleted_at is null
  limit 1;

  -- Supabase Storage may not expose metadata.size to the INSERT policy until
  -- its internal metadata write. A zero value is accepted only after the app
  -- already reserved this exact single-use path with a positive size.
  if p_size_bytes < 1 and v_existing_size is null then
    return false;
  end if;

  -- Object names are single-use. This prevents delete/reupload from replacing
  -- content that was already moderated under the same database reference.
  if exists (
    select 1
    from public.storage_upload_usage_events event
    where event.uploader_id = v_user_id
      and event.bucket_id = p_bucket_id
      and event.object_name = p_object_name
      and event.deleted_at is not null
  ) then
    return false;
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_window_count, v_window_bytes
  from public.storage_upload_usage_events event
  where event.uploader_id = v_user_id
    and event.bucket_id = p_bucket_id
    and event.object_name <> p_object_name
    and event.created_at > v_now - v_window;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_daily_count, v_daily_bytes
  from public.storage_upload_usage_events event
  where event.uploader_id = v_user_id
    and event.bucket_id = p_bucket_id
    and event.object_name <> p_object_name
    and event.created_at > v_now - interval '24 hours';

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_live_count, v_live_bytes
  from public.storage_upload_usage_events event
  where event.uploader_id = v_user_id
    and event.bucket_id = p_bucket_id
    and event.object_name <> p_object_name
    and event.deleted_at is null
    and (
      event.committed_at is not null
      or event.created_at > v_now - interval '1 hour'
    );

  select coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_global_live_bytes
  from public.storage_upload_usage_events event
  where event.bucket_id = p_bucket_id
    and event.object_name <> p_object_name
    and event.deleted_at is null
    and (
      event.committed_at is not null
      or event.created_at > v_now - interval '1 hour'
    );

  p_size_bytes := greatest(
    p_size_bytes,
    coalesce(v_existing_size, 0)
  );

  if v_window_count + 1 > v_window_object_limit
    or v_window_bytes + p_size_bytes > v_window_byte_limit
    or v_daily_count + 1 > v_daily_object_limit
    or v_daily_bytes + p_size_bytes > v_daily_byte_limit
    or v_live_count + 1 > v_live_object_limit
    or v_live_bytes + p_size_bytes > v_live_byte_limit
    or v_global_live_bytes + p_size_bytes > v_global_live_byte_limit
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
  )
  on conflict (bucket_id, object_name) do update
  set size_bytes = greatest(
    public.storage_upload_usage_events.size_bytes,
    excluded.size_bytes
  )
  where public.storage_upload_usage_events.uploader_id = excluded.uploader_id
    and public.storage_upload_usage_events.deleted_at is null;

  return true;
end;
$$;

revoke all on function public.reserve_storage_upload_quota(text, text, bigint)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_storage_upload_quota(text, text, bigint)
to authenticated;

create or replace function public.track_storage_upload_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual_size bigint;
begin
  if tg_op = 'DELETE' then
    update public.storage_upload_usage_events
    set deleted_at = pg_catalog.clock_timestamp()
    where bucket_id = old.bucket_id
      and object_name = old.name
      and deleted_at is null;
    return old;
  end if;

  v_actual_size := public.storage_object_size_bytes(new.metadata);

  if coalesce((select auth.role()), '') = 'authenticated'
    and new.bucket_id in (
      'profile-photos',
      'profile-stories',
      'profile-videos',
      'message-photos',
      'message-videos',
      'message-audio',
      'verification-selfies'
    )
    and not public.reserve_storage_upload_quota(
      new.bucket_id,
      new.name,
      v_actual_size
    )
  then
    raise exception 'Storage upload quota exceeded.' using errcode = '42501';
  end if;

  update public.storage_upload_usage_events
  set
    size_bytes = greatest(
      size_bytes,
      public.storage_object_size_bytes(new.metadata)
    ),
    committed_at = coalesce(committed_at, pg_catalog.clock_timestamp()),
    deleted_at = null
  where bucket_id = new.bucket_id
    and object_name = new.name;

  return new;
end;
$$;

revoke all on function public.track_storage_upload_usage()
from public, anon, authenticated, service_role;

drop trigger if exists track_storage_upload_usage_trigger on storage.objects;
create trigger track_storage_upload_usage_trigger
after insert or update or delete on storage.objects
for each row execute function public.track_storage_upload_usage();

create policy "Users can upload their own profile photo files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create policy "Users can upload own profile story files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create policy "Users can upload own profile video files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create policy "Conversation participants can upload message photo files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-photos'
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create policy "Conversation participants can upload message video files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-videos'
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create policy "Conversation participants can upload message audio files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-audio'
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create policy "Users can upload own verification selfies"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

-- Approved objects must be immutable. The application always writes UUID-based
-- new paths, so direct UPDATE/upsert is neither required nor safe.
drop policy if exists "Users can update their own profile photo files"
on storage.objects;
drop policy if exists "Users can update own profile story files"
on storage.objects;
drop policy if exists "Users can update own profile video files"
on storage.objects;

-- Owners may remove only orphaned objects. Referenced media must first pass
-- through the server/database deletion flow so moderation and retention state
-- cannot be bypassed.
drop policy if exists "Users can delete their own profile photo files"
on storage.objects;
create policy "Users can delete orphan profile photo files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.profile_photos photo
    where photo.storage_path = storage.objects.name
  )
);

drop policy if exists "Users can delete own profile story files"
on storage.objects;
drop policy if exists "Users can delete their own profile story files"
on storage.objects;
create policy "Users can delete orphan profile story files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.profile_stories story
    where story.storage_path = storage.objects.name
  )
);

drop policy if exists "Users can delete own profile video files"
on storage.objects;
create policy "Users can delete orphan profile video files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.profile_videos video
    where video.storage_path = storage.objects.name
  )
);

-- A disabled stories flag must stop both row discovery and direct object reads.
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
    join public.profiles owner_profile on owner_profile.id = story.profile_id
    join public.profiles viewer_profile on viewer_profile.id = (select auth.uid())
    where story.storage_path = storage.objects.name
      and story.expires_at > pg_catalog.now()
      and story.content_moderation_status = 'approved'
      and owner_profile.onboarding_completed = true
      and owner_profile.public_slug is not null
      and owner_profile.suspended_at is null
      and owner_profile.deletion_requested_at is null
      and owner_profile.deletion_scheduled_at is null
      and owner_profile.content_moderation_status = 'approved'
      and coalesce(owner_profile.is_admin, false) = false
      and viewer_profile.onboarding_completed = true
      and viewer_profile.suspended_at is null
      and viewer_profile.deletion_requested_at is null
      and viewer_profile.deletion_scheduled_at is null
      and (
        story.profile_id = viewer_profile.id
        or coalesce(viewer_profile.is_admin, false)
        or viewer_profile.account_type <> owner_profile.account_type
      )
      and not public.profile_pair_blocked(
        viewer_profile.id,
        owner_profile.id
      )
  )
);

-- Direct table mutations could otherwise hide/delete message attachments
-- without recording the mandatory safety-retention copy.
drop policy if exists "Message senders can update their own messages"
on public.messages;
drop policy if exists "Message senders can delete their own messages"
on public.messages;
drop policy if exists "Users can update their own messages"
on public.messages;
drop policy if exists "Users can delete their own messages"
on public.messages;
revoke update, delete on public.messages from authenticated;

-- Full-catalog browse RPCs are rendered by the Next.js server. Keeping them
-- directly executable with the public Supabase key would bypass the site's
-- edge/WAF controls and permit unbounded scraping cost.
revoke all on function public.get_au_pair_search_cards()
from public, anon, authenticated, service_role;
revoke all on function public.get_family_search_cards()
from public, anon, authenticated, service_role;
grant execute on function public.get_au_pair_search_cards() to service_role;
grant execute on function public.get_family_search_cards() to service_role;

-- SECURITY DEFINER story RPCs must enforce the same privacy, kill-switch, and
-- block rules as table/storage RLS. Guests may receive locked card metadata,
-- but never an underlying Storage path.
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
      or exists (
        select 1
        from public.profiles viewer_profile
        where viewer_profile.id = (select auth.uid())
          and viewer_profile.onboarding_completed = true
          and viewer_profile.suspended_at is null
          and viewer_profile.deletion_requested_at is null
          and viewer_profile.deletion_scheduled_at is null
          and (
            coalesce(viewer_profile.is_admin, false)
            or viewer_profile.account_type <> owner_profile.account_type
          )
          and not public.profile_pair_blocked(
            viewer_profile.id,
            owner_profile.id
          )
      )
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
  join public.profiles viewer_profile
    on viewer_profile.id = (select auth.uid())
  where public.database_feature_flag_enabled('stories')
    and story.id = p_story_id
    and story.expires_at > pg_catalog.now()
    and story.content_moderation_status = 'approved'
    and public.public_profile_is_eligible(owner_profile.id, true)
    and viewer_profile.onboarding_completed = true
    and viewer_profile.suspended_at is null
    and viewer_profile.deletion_requested_at is null
    and viewer_profile.deletion_scheduled_at is null
    and (
      viewer_profile.id = owner_profile.id
      or coalesce(viewer_profile.is_admin, false)
      or viewer_profile.account_type <> owner_profile.account_type
    )
    and not public.profile_pair_blocked(
      viewer_profile.id,
      owner_profile.id
    )
  limit 1;
$$;

revoke all on function public.get_public_story(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_story(uuid)
to authenticated;

-- Direct RPC calls cannot bypass the proxy's activity-update throttle.
create or replace function public.touch_profile_activity()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_touched_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  perform pg_catalog.set_config(
    'perfect_aupair.trusted_profile_activity_touch',
    '1',
    true
  );

  update public.profiles
  set last_active_at = pg_catalog.clock_timestamp()
  where id = v_user_id
    and onboarding_completed = true
    and suspended_at is null
    and deletion_requested_at is null
    and deletion_scheduled_at is null
    and coalesce(is_admin, false) = false
    and (
      last_active_at is null
      or last_active_at <= pg_catalog.clock_timestamp() - interval '5 minutes'
    )
  returning last_active_at into v_touched_at;

  if v_touched_at is null then
    select profile.last_active_at
    into v_touched_at
    from public.profiles profile
    where profile.id = v_user_id;
  end if;

  return v_touched_at;
end;
$$;

revoke all on function public.touch_profile_activity()
from public, anon, authenticated, service_role;
grant execute on function public.touch_profile_activity()
to authenticated;

-- Serialize row-based abuse limits so parallel requests cannot all observe the
-- same pre-insert count.
create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := (select auth.uid());
begin
  if v_sender_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('message-rate:' || v_sender_id::text, 0)
  );

  if (
    select pg_catalog.count(*)
    from public.messages message
    where message.sender_id = v_sender_id
      and message.created_at > pg_catalog.now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Please slow down before sending more messages.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.messages message
    where message.sender_id = v_sender_id
      and message.created_at > pg_catalog.now() - interval '1 hour'
  ) >= 120 then
    raise exception 'You have sent many messages recently. Please try again later.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_story_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := (select auth.uid());
begin
  if v_profile_id is null or new.profile_id <> v_profile_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('story-rate:' || v_profile_id::text, 0)
  );

  if (
    select pg_catalog.count(*)
    from public.profile_stories story
    where story.profile_id = v_profile_id
      and story.created_at > pg_catalog.now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Please wait before posting more stories.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.profile_stories story
    where story.profile_id = v_profile_id
      and story.expires_at > pg_catalog.now()
  ) >= 12 then
    raise exception 'You have many active stories already. Please delete one before posting another.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_profile_photo_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := (select auth.uid());
begin
  if v_profile_id is null or new.profile_id <> v_profile_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('profile-photo-rate:' || v_profile_id::text, 0)
  );

  if (
    select pg_catalog.count(*)
    from public.profile_photos photo
    where photo.profile_id = v_profile_id
      and photo.created_at > pg_catalog.now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Please wait before uploading more profile photos.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_verification_request_launch_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null
    or new.profile_id <> v_user_id
    or (storage.foldername(new.selfie_path))[1] is distinct from v_user_id::text
    or not public.public_profile_is_eligible(v_user_id, true)
  then
    raise exception 'Invalid verification request' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('verification-request:' || v_user_id::text, 0)
  );

  if (
    select pg_catalog.count(*)
    from public.profile_verification_requests request
    where request.profile_id = v_user_id
      and request.created_at > pg_catalog.now() - interval '24 hours'
  ) >= 3 then
    raise exception 'Please wait before requesting verification again.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_verification_request_launch_guard()
from public, anon, authenticated, service_role;
drop trigger if exists ab_validate_verification_request_launch_guard
on public.profile_verification_requests;
create trigger ab_validate_verification_request_launch_guard
before insert on public.profile_verification_requests
for each row execute function public.validate_verification_request_launch_guard();

create or replace function public.validate_moderation_report_launch_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return new;
  end if;

  if v_user_id is null
    or new.reporter_id <> v_user_id
    or new.reported_profile_id = v_user_id
    or not public.public_profile_is_eligible(new.reported_profile_id, true)
    or not exists (
      select 1
      from public.profiles reporter
      where reporter.id = v_user_id
        and reporter.onboarding_completed = true
        and reporter.suspended_at is null
        and reporter.deletion_requested_at is null
        and reporter.deletion_scheduled_at is null
        and coalesce(reporter.is_admin, false) = false
    )
  then
    raise exception 'Invalid moderation report' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('moderation-report:' || v_user_id::text, 0)
  );

  if (
    select pg_catalog.count(*)
    from public.moderation_reports report
    where report.reporter_id = v_user_id
      and report.created_at > pg_catalog.now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Please wait before submitting more reports.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_moderation_report_launch_guard()
from public, anon, authenticated, service_role;
drop trigger if exists ab_validate_moderation_report_launch_guard
on public.moderation_reports;
create trigger ab_validate_moderation_report_launch_guard
before insert on public.moderation_reports
for each row execute function public.validate_moderation_report_launch_guard();
