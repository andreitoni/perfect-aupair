-- Deliver every private media bucket through one authenticated, counted proxy.
-- Storage signed URLs must not become reusable cost-amplification tokens.

create table if not exists public.private_media_delivery_counters (
  bucket_id text not null check (
    bucket_id in (
      '*',
      'profile-stories',
      'profile-videos',
      'message-photos',
      'message-videos',
      'message-audio',
      'verification-selfies'
    )
  ),
  scope text not null check (
    scope in (
      'ip_10m',
      'prefix_10m',
      'viewer_10m',
      'viewer_day',
      'bucket_hour',
      'bucket_day',
      'global_hour',
      'global_day'
    )
  ),
  identity_hash text not null check (pg_catalog.char_length(identity_hash) between 1 and 80),
  window_started_at timestamptz not null,
  request_count bigint not null default 0 check (request_count >= 0),
  byte_count bigint not null default 0 check (byte_count >= 0),
  primary key (bucket_id, scope, identity_hash, window_started_at)
);

alter table public.private_media_delivery_counters enable row level security;
revoke all on table public.private_media_delivery_counters
from public, anon, authenticated;
grant select, insert, update, delete
on table public.private_media_delivery_counters to service_role;

create index if not exists private_media_delivery_counters_window_idx
on public.private_media_delivery_counters (window_started_at);

create table if not exists public.media_request_attempt_counters (
  scope text not null check (scope in ('ip_10m', 'prefix_10m', 'global_10m')),
  identity_hash text not null check (pg_catalog.char_length(identity_hash) between 1 and 80),
  window_started_at timestamptz not null,
  request_count bigint not null default 0 check (request_count >= 0),
  primary key (scope, identity_hash, window_started_at)
);

alter table public.media_request_attempt_counters enable row level security;
revoke all on table public.media_request_attempt_counters
from public, anon, authenticated;
grant select, insert, update, delete
on table public.media_request_attempt_counters to service_role;
create index if not exists media_request_attempt_counters_window_idx
on public.media_request_attempt_counters (window_started_at);

insert into public.feature_flags (key, enabled, description)
values (
  'private_media_delivery',
  true,
  'Emergency kill switch for all same-origin private media delivery.'
)
on conflict (key) do nothing;

create index if not exists profile_verification_requests_selfie_path_idx
on public.profile_verification_requests (selfie_path);

alter table public.profile_videos
  add column if not exists content_moderation_status text not null default 'pending',
  add column if not exists content_moderation_reviewed_at timestamptz,
  add column if not exists content_moderation_reviewed_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists content_moderation_reason text;

alter table public.profile_videos
drop constraint if exists profile_videos_content_moderation_status_valid;
alter table public.profile_videos
add constraint profile_videos_content_moderation_status_valid
check (content_moderation_status in ('pending', 'approved', 'rejected'));

create index if not exists profile_videos_moderation_created_idx
on public.profile_videos (content_moderation_status, created_at desc);

update public.profile_videos
set
  content_moderation_status = 'pending',
  content_moderation_reviewed_at = null,
  content_moderation_reviewed_by = null,
  content_moderation_reason = 'Existing profile video requires manual launch review.';

create or replace function public.enforce_profile_video_moderation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.role()), '');
begin
  if v_role = 'service_role'
    or (v_role = '' and session_user in ('postgres', 'supabase_admin'))
  then
    return new;
  end if;

  if v_role <> 'authenticated' then
    raise exception 'Authenticated profile required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.content_moderation_status := 'pending';
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason := 'Profile video awaiting manual review.';

  elsif new.storage_path is distinct from old.storage_path then
    new.content_moderation_status := 'pending';
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason := 'Profile video awaiting manual review.';

  else
    -- Owners may change video metadata, but never their review result.
    new.content_moderation_status := old.content_moderation_status;
    new.content_moderation_reviewed_at := old.content_moderation_reviewed_at;
    new.content_moderation_reviewed_by := old.content_moderation_reviewed_by;
    new.content_moderation_reason := old.content_moderation_reason;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_profile_video_moderation_state()
from public, anon, authenticated, service_role;

drop trigger if exists ac_enforce_profile_video_moderation_state
on public.profile_videos;
create trigger ac_enforce_profile_video_moderation_state
before insert or update on public.profile_videos
for each row execute function public.enforce_profile_video_moderation_state();

-- Intro-video metadata is private too: guests do not need the Storage path,
-- while owners, admins, and eligible opposite-account viewers retain access.
drop policy if exists "Public can read active profile video metadata"
on public.profile_videos;
drop policy if exists "Public can read public profile video metadata"
on public.profile_videos;
drop policy if exists "Users can read own profile video metadata"
on public.profile_videos;

create policy "Eligible users can read profile video metadata"
on public.profile_videos for select to authenticated
using (
  profile_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles viewer_profile
    join public.profiles owner_profile on owner_profile.id = profile_videos.profile_id
    where viewer_profile.id = (select auth.uid())
      and (
        coalesce(viewer_profile.is_admin, false)
        or (
          profile_videos.content_moderation_status = 'approved'
          and public.database_feature_flag_enabled('private_media_delivery')
          and public.public_profile_is_eligible(viewer_profile.id, true)
          and public.public_profile_is_eligible(owner_profile.id, true)
          and viewer_profile.account_type <> owner_profile.account_type
          and not public.profile_pair_blocked(viewer_profile.id, owner_profile.id)
        )
      )
  )
);

revoke select on table public.profile_videos from anon;
grant select on table public.profile_videos to authenticated, service_role;

create or replace function public.get_public_profile_video_ids()
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select video.profile_id
  from public.profile_videos video
  where public.database_feature_flag_enabled('private_media_delivery')
    and video.content_moderation_status = 'approved'
    and public.public_profile_is_eligible(video.profile_id, true)
  order by video.created_at desc
  limit 500;
$$;

create or replace function public.public_profile_has_approved_video(
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select exists (
    select 1
    from public.profile_videos video
    where video.profile_id = p_profile_id
      and public.database_feature_flag_enabled('private_media_delivery')
      and video.content_moderation_status = 'approved'
      and public.public_profile_is_eligible(video.profile_id, true)
  );
$$;

revoke all on function public.get_public_profile_video_ids()
from public, anon, authenticated, service_role;
revoke all on function public.public_profile_has_approved_video(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_profile_video_ids()
to anon, authenticated;
grant execute on function public.public_profile_has_approved_video(uuid)
to anon, authenticated;

create or replace function public.public_profile_has_active_story(
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  select exists (
    select 1
    from public.profile_stories story
    where story.profile_id = p_profile_id
      and public.database_feature_flag_enabled('stories')
      and public.database_feature_flag_enabled('private_media_delivery')
      and story.expires_at > pg_catalog.now()
      and story.content_moderation_status = 'approved'
      and public.public_profile_is_eligible(story.profile_id, true)
  );
$$;

revoke all on function public.public_profile_has_active_story(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.public_profile_has_active_story(uuid)
to anon, authenticated;

drop policy if exists "Guests can view approved active profile story metadata"
on public.profile_stories;
revoke select on table public.profile_stories from anon;

-- Browsers receive only same-origin proxy URLs. Direct Storage SELECT remains
-- unavailable, including to owners, so every byte is subject to shared caps.
drop policy if exists "Authenticated users can view eligible profile story files"
on storage.objects;
drop policy if exists "Authenticated users can view matched profile video files"
on storage.objects;
drop policy if exists "Conversation participants can view message photo files"
on storage.objects;
drop policy if exists "Conversation participants can view message video files"
on storage.objects;
drop policy if exists "Conversation participants can view message audio files"
on storage.objects;
drop policy if exists "Users can read own verification selfies"
on storage.objects;

create or replace function public.get_private_media_access(
  p_bucket_id text,
  p_storage_path text,
  p_viewer_id uuid,
  p_is_admin boolean,
  p_ip_hash text,
  p_ip_prefix_hash text,
  p_range_start bigint default null,
  p_range_end bigint default null,
  p_range_suffix bigint default null
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  storage_path text,
  object_size_bytes bigint,
  charged_bytes bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ten_minute timestamptz := pg_catalog.date_bin(
    interval '10 minutes', v_now, timestamptz '2000-01-01 00:00:00+00'
  );
  v_hour timestamptz := pg_catalog.date_trunc('hour', v_now);
  v_day timestamptz := pg_catalog.date_trunc('day', v_now);
  v_authorized_path text;
  v_object_size bigint;
  v_charge_bytes bigint;
  v_bucket_hour_byte_limit bigint;
  v_bucket_day_byte_limit bigint;
  v_ip_requests bigint;
  v_ip_bytes bigint;
  v_prefix_requests bigint;
  v_prefix_bytes bigint;
  v_viewer_requests bigint;
  v_viewer_bytes bigint;
  v_viewer_day_requests bigint;
  v_viewer_day_bytes bigint;
  v_bucket_hour_requests bigint;
  v_bucket_hour_bytes bigint;
  v_bucket_day_requests bigint;
  v_bucket_day_bytes bigint;
  v_global_hour_requests bigint;
  v_global_hour_bytes bigint;
  v_global_day_requests bigint;
  v_global_day_bytes bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_bucket_id is null
    or p_bucket_id not in (
      'profile-stories',
      'profile-videos',
      'message-photos',
      'message-videos',
      'message-audio',
      'verification-selfies'
    )
    or p_viewer_id is null
    or p_storage_path is null
    or pg_catalog.char_length(p_storage_path) not between 3 and 1024
    or p_ip_hash is null
    or p_ip_prefix_hash is null
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_ip_prefix_hash !~ '^[0-9a-f]{64}$'
  then
    return;
  end if;

  if not coalesce(p_is_admin, false)
    and not public.database_feature_flag_enabled('private_media_delivery')
  then
    return;
  end if;

  if not coalesce(p_is_admin, false)
    and not exists (
      select 1
      from public.profiles viewer_profile
      where viewer_profile.id = p_viewer_id
        and viewer_profile.suspended_at is null
        and viewer_profile.deletion_requested_at is null
        and viewer_profile.deletion_scheduled_at is null
    )
  then
    return;
  end if;

  if p_bucket_id = 'profile-stories' then
    if not coalesce(p_is_admin, false)
      and not public.database_feature_flag_enabled('stories')
    then
      return;
    end if;

    select story.storage_path into v_authorized_path
    from public.profile_stories story
    join public.profiles owner_profile on owner_profile.id = story.profile_id
    where story.storage_path = p_storage_path
      and (storage.foldername(story.storage_path))[1] = story.profile_id::text
      and (coalesce(p_is_admin, false) or story.expires_at > v_now)
      and (
        coalesce(p_is_admin, false)
        or story.profile_id = p_viewer_id
        or (
          story.content_moderation_status = 'approved'
          and public.public_profile_is_eligible(owner_profile.id, true)
          and exists (
            select 1
            from public.profiles viewer_profile
            where viewer_profile.id = p_viewer_id
              and public.public_profile_is_eligible(viewer_profile.id, true)
              and viewer_profile.account_type <> owner_profile.account_type
              and not public.profile_pair_blocked(
                viewer_profile.id,
                owner_profile.id
              )
          )
        )
      )
    limit 1;
  elsif p_bucket_id = 'profile-videos' then
    select video.storage_path into v_authorized_path
    from public.profile_videos video
    join public.profiles owner_profile on owner_profile.id = video.profile_id
    where video.storage_path = p_storage_path
      and (storage.foldername(video.storage_path))[1] = video.profile_id::text
      and (
        coalesce(p_is_admin, false)
        or video.profile_id = p_viewer_id
        or (
          video.content_moderation_status = 'approved'
          and
          public.public_profile_is_eligible(owner_profile.id, true)
          and exists (
            select 1
            from public.profiles viewer_profile
            where viewer_profile.id = p_viewer_id
              and public.public_profile_is_eligible(viewer_profile.id, true)
              and viewer_profile.account_type <> owner_profile.account_type
              and not public.profile_pair_blocked(
                viewer_profile.id,
                owner_profile.id
              )
          )
        )
      )
    limit 1;
  elsif p_bucket_id in ('message-photos', 'message-videos', 'message-audio') then
    select p_storage_path into v_authorized_path
    from public.messages message
    join public.conversations conversation on conversation.id = message.conversation_id
    where (
        (p_bucket_id = 'message-photos' and message.image_path = p_storage_path)
        or (p_bucket_id = 'message-videos' and message.video_path = p_storage_path)
        or (p_bucket_id = 'message-audio' and message.audio_path = p_storage_path)
      )
      and (storage.foldername(p_storage_path))[1] = conversation.id::text
      and not (
        (p_bucket_id = 'message-photos' and exists (
          select 1 from public.retained_message_photos retained
          where retained.original_image_path = p_storage_path
        ))
        or (p_bucket_id = 'message-videos' and exists (
          select 1 from public.retained_message_videos retained
          where retained.original_video_path = p_storage_path
        ))
        or (p_bucket_id = 'message-audio' and exists (
          select 1 from public.retained_message_audio retained
          where retained.original_audio_path = p_storage_path
        ))
      )
      and (
        coalesce(p_is_admin, false)
        or conversation.family_id = p_viewer_id
        or conversation.au_pair_id = p_viewer_id
      )
    limit 1;

    if v_authorized_path is null and coalesce(p_is_admin, false) then
      if p_bucket_id = 'message-photos' and exists (
        select 1 from public.retained_message_photos retained
        where retained.original_image_path = p_storage_path
          and (storage.foldername(p_storage_path))[1]
            = retained.conversation_id::text
      ) then
        v_authorized_path := p_storage_path;
      elsif p_bucket_id = 'message-videos' and exists (
        select 1 from public.retained_message_videos retained
        where retained.original_video_path = p_storage_path
          and (storage.foldername(p_storage_path))[1]
            = retained.conversation_id::text
      ) then
        v_authorized_path := p_storage_path;
      elsif p_bucket_id = 'message-audio' and exists (
        select 1 from public.retained_message_audio retained
        where retained.original_audio_path = p_storage_path
          and (storage.foldername(p_storage_path))[1]
            = retained.conversation_id::text
      ) then
        v_authorized_path := p_storage_path;
      end if;
    end if;
  elsif p_bucket_id = 'verification-selfies' then
    select request.selfie_path into v_authorized_path
    from public.profile_verification_requests request
    where request.selfie_path = p_storage_path
      and (storage.foldername(request.selfie_path))[1] = request.profile_id::text
      and (
        coalesce(p_is_admin, false)
        or request.profile_id = p_viewer_id
      )
    limit 1;
  end if;

  if v_authorized_path is null then
    return;
  end if;

  select public.storage_object_size_bytes(object.metadata)
  into v_object_size
  from storage.objects object
  where object.bucket_id = p_bucket_id
    and object.name = v_authorized_path
  limit 1;

  if v_object_size is null or v_object_size <= 0 then
    return;
  end if;

  if p_range_start is not null and p_range_suffix is not null then
    return query select false, -1, null::text, v_object_size, 0::bigint;
    return;
  elsif p_range_suffix is not null then
    if p_range_suffix <= 0 then
      return query select false, -1, null::text, v_object_size, 0::bigint;
      return;
    end if;

    v_charge_bytes := least(p_range_suffix, v_object_size);
  elsif p_range_start is not null then
    if p_range_start < 0
      or p_range_start >= v_object_size
      or (p_range_end is not null and p_range_end < p_range_start)
    then
      return query select false, -1, null::text, v_object_size, 0::bigint;
      return;
    end if;

    v_charge_bytes := least(
      coalesce(p_range_end, v_object_size - 1),
      v_object_size - 1
    ) - p_range_start + 1;
  else
    v_charge_bytes := v_object_size;
  end if;

  case p_bucket_id
    when 'profile-stories' then
      v_bucket_hour_byte_limit := 2::bigint * 1024 * 1024 * 1024;
      v_bucket_day_byte_limit := 10::bigint * 1024 * 1024 * 1024;
    when 'profile-videos' then
      v_bucket_hour_byte_limit := 6::bigint * 1024 * 1024 * 1024;
      v_bucket_day_byte_limit := 30::bigint * 1024 * 1024 * 1024;
    when 'message-photos' then
      v_bucket_hour_byte_limit := 2::bigint * 1024 * 1024 * 1024;
      v_bucket_day_byte_limit := 10::bigint * 1024 * 1024 * 1024;
    when 'message-videos' then
      v_bucket_hour_byte_limit := 10::bigint * 1024 * 1024 * 1024;
      v_bucket_day_byte_limit := 50::bigint * 1024 * 1024 * 1024;
    when 'message-audio' then
      v_bucket_hour_byte_limit := 2::bigint * 1024 * 1024 * 1024;
      v_bucket_day_byte_limit := 10::bigint * 1024 * 1024 * 1024;
    when 'verification-selfies' then
      v_bucket_hour_byte_limit := 256::bigint * 1024 * 1024;
      v_bucket_day_byte_limit := 1024::bigint * 1024 * 1024;
  end case;

  -- All callers lock shared scopes in the same order, making the caps atomic
  -- across serverless instances without deadlocks or count races.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private-media:global-day:' || v_day::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private-media:global-hour:' || v_hour::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private-media:viewer-day:' || p_viewer_id::text || ':' || v_day::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private-media:viewer:' || p_viewer_id::text || ':' || v_ten_minute::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private-media:bucket-day:' || p_bucket_id || ':' || v_day::text, 0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private-media:bucket-hour:' || p_bucket_id || ':' || v_hour::text, 0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private-media:prefix:' || p_ip_prefix_hash || ':' || v_ten_minute::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private-media:ip:' || p_ip_hash || ':' || v_ten_minute::text,
      0
    )
  );

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_ip_requests, v_ip_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = '*'
    and counter.scope = 'ip_10m'
    and counter.identity_hash = p_ip_hash
    and counter.window_started_at = v_ten_minute;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_prefix_requests, v_prefix_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = '*'
    and counter.scope = 'prefix_10m'
    and counter.identity_hash = p_ip_prefix_hash
    and counter.window_started_at = v_ten_minute;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_viewer_requests, v_viewer_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = '*'
    and counter.scope = 'viewer_10m'
    and counter.identity_hash = p_viewer_id::text
    and counter.window_started_at = v_ten_minute;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_viewer_day_requests, v_viewer_day_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = '*'
    and counter.scope = 'viewer_day'
    and counter.identity_hash = p_viewer_id::text
    and counter.window_started_at = v_day;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_bucket_hour_requests, v_bucket_hour_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = p_bucket_id
    and counter.scope = 'bucket_hour'
    and counter.identity_hash = 'all'
    and counter.window_started_at = v_hour;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_bucket_day_requests, v_bucket_day_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = p_bucket_id
    and counter.scope = 'bucket_day'
    and counter.identity_hash = 'all'
    and counter.window_started_at = v_day;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_global_hour_requests, v_global_hour_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = '*'
    and counter.scope = 'global_hour'
    and counter.identity_hash = 'all'
    and counter.window_started_at = v_hour;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_global_day_requests, v_global_day_bytes
  from public.private_media_delivery_counters counter
  where counter.bucket_id = '*'
    and counter.scope = 'global_day'
    and counter.identity_hash = 'all'
    and counter.window_started_at = v_day;

  v_ip_requests := coalesce(v_ip_requests, 0);
  v_ip_bytes := coalesce(v_ip_bytes, 0);
  v_prefix_requests := coalesce(v_prefix_requests, 0);
  v_prefix_bytes := coalesce(v_prefix_bytes, 0);
  v_viewer_requests := coalesce(v_viewer_requests, 0);
  v_viewer_bytes := coalesce(v_viewer_bytes, 0);
  v_viewer_day_requests := coalesce(v_viewer_day_requests, 0);
  v_viewer_day_bytes := coalesce(v_viewer_day_bytes, 0);
  v_bucket_hour_requests := coalesce(v_bucket_hour_requests, 0);
  v_bucket_hour_bytes := coalesce(v_bucket_hour_bytes, 0);
  v_bucket_day_requests := coalesce(v_bucket_day_requests, 0);
  v_bucket_day_bytes := coalesce(v_bucket_day_bytes, 0);
  v_global_hour_requests := coalesce(v_global_hour_requests, 0);
  v_global_hour_bytes := coalesce(v_global_hour_bytes, 0);
  v_global_day_requests := coalesce(v_global_day_requests, 0);
  v_global_day_bytes := coalesce(v_global_day_bytes, 0);

  if v_ip_requests + 1 > 600
    or v_ip_bytes + v_charge_bytes > 1024::bigint * 1024 * 1024
    or v_prefix_requests + 1 > 2400
    or v_prefix_bytes + v_charge_bytes > 8::bigint * 1024 * 1024 * 1024
    or v_viewer_requests + 1 > 400
    or v_viewer_bytes + v_charge_bytes > 1024::bigint * 1024 * 1024
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_ten_minute + interval '10 minutes' - v_now
      )))::integer
    ), null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  if v_viewer_day_requests + 1 > 4000
    or v_viewer_day_bytes + v_charge_bytes > 5::bigint * 1024 * 1024 * 1024
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_day + interval '1 day' - v_now
      )))::integer
    ), null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  if v_bucket_hour_requests + 1 > 20000
    or v_bucket_hour_bytes + v_charge_bytes > v_bucket_hour_byte_limit
    or v_global_hour_requests + 1 > 50000
    or v_global_hour_bytes + v_charge_bytes > 20::bigint * 1024 * 1024 * 1024
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_hour + interval '1 hour' - v_now
      )))::integer
    ), null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  if v_bucket_day_requests + 1 > 100000
    or v_bucket_day_bytes + v_charge_bytes > v_bucket_day_byte_limit
    or v_global_day_requests + 1 > 250000
    or v_global_day_bytes + v_charge_bytes > 75::bigint * 1024 * 1024 * 1024
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_day + interval '1 day' - v_now
      )))::integer
    ), null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  insert into public.private_media_delivery_counters (
    bucket_id, scope, identity_hash, window_started_at, request_count, byte_count
  ) values
    ('*', 'ip_10m', p_ip_hash, v_ten_minute, 1, v_charge_bytes),
    ('*', 'prefix_10m', p_ip_prefix_hash, v_ten_minute, 1, v_charge_bytes),
    ('*', 'viewer_10m', p_viewer_id::text, v_ten_minute, 1, v_charge_bytes),
    ('*', 'viewer_day', p_viewer_id::text, v_day, 1, v_charge_bytes),
    (p_bucket_id, 'bucket_hour', 'all', v_hour, 1, v_charge_bytes),
    (p_bucket_id, 'bucket_day', 'all', v_day, 1, v_charge_bytes),
    ('*', 'global_hour', 'all', v_hour, 1, v_charge_bytes),
    ('*', 'global_day', 'all', v_day, 1, v_charge_bytes)
  on conflict (bucket_id, scope, identity_hash, window_started_at) do update
  set
    request_count = private_media_delivery_counters.request_count + 1,
    byte_count = private_media_delivery_counters.byte_count + excluded.byte_count;

  return query
  select true, 0, v_authorized_path, v_object_size, v_charge_bytes;
end;
$$;

create or replace function public.reserve_media_request_attempt(
  p_ip_hash text,
  p_ip_prefix_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window timestamptz := pg_catalog.date_bin(
    interval '10 minutes', v_now, timestamptz '2000-01-01 00:00:00+00'
  );
  v_ip_count bigint;
  v_prefix_count bigint;
  v_global_count bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_ip_hash is null
    or p_ip_prefix_hash is null
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_ip_prefix_hash !~ '^[0-9a-f]{64}$'
  then
    return query select false, 600;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('media-attempt:global:' || v_window::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-attempt:prefix:' || p_ip_prefix_hash || ':' || v_window::text, 0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-attempt:ip:' || p_ip_hash || ':' || v_window::text, 0
    )
  );

  select coalesce(counter.request_count, 0) into v_ip_count
  from public.media_request_attempt_counters counter
  where counter.scope = 'ip_10m'
    and counter.identity_hash = p_ip_hash
    and counter.window_started_at = v_window;

  select coalesce(counter.request_count, 0) into v_prefix_count
  from public.media_request_attempt_counters counter
  where counter.scope = 'prefix_10m'
    and counter.identity_hash = p_ip_prefix_hash
    and counter.window_started_at = v_window;

  select coalesce(counter.request_count, 0) into v_global_count
  from public.media_request_attempt_counters counter
  where counter.scope = 'global_10m'
    and counter.identity_hash = 'all'
    and counter.window_started_at = v_window;

  if coalesce(v_ip_count, 0) >= 600
    or coalesce(v_prefix_count, 0) >= 2400
    or coalesce(v_global_count, 0) >= 100000
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_window + interval '10 minutes' - v_now
      )))::integer
    );
    return;
  end if;

  insert into public.media_request_attempt_counters (
    scope, identity_hash, window_started_at, request_count
  ) values
    ('ip_10m', p_ip_hash, v_window, 1),
    ('prefix_10m', p_ip_prefix_hash, v_window, 1),
    ('global_10m', 'all', v_window, 1)
  on conflict (scope, identity_hash, window_started_at) do update
  set request_count = media_request_attempt_counters.request_count + 1;

  return query select true, 0;
end;
$$;

create or replace function public.cleanup_private_media_delivery_counters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
  v_batch_deleted integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  v_deleted := 0;

  for v_batch in 1..10 loop
    with stale as (
      select counter.ctid
      from public.private_media_delivery_counters counter
      where counter.window_started_at < pg_catalog.clock_timestamp() - interval '2 days'
      order by counter.window_started_at
      limit 5000
    )
    delete from public.private_media_delivery_counters counter
    using stale
    where counter.ctid = stale.ctid;

    get diagnostics v_batch_deleted = row_count;
    v_deleted := v_deleted + v_batch_deleted;
    exit when v_batch_deleted < 5000;
  end loop;

  for v_batch in 1..10 loop
    with stale as (
      select counter.ctid
      from public.media_request_attempt_counters counter
      where counter.window_started_at < pg_catalog.clock_timestamp() - interval '2 days'
      order by counter.window_started_at
      limit 5000
    )
    delete from public.media_request_attempt_counters counter
    using stale
    where counter.ctid = stale.ctid;

    get diagnostics v_batch_deleted = row_count;
    v_deleted := v_deleted + v_batch_deleted;
    exit when v_batch_deleted < 5000;
  end loop;

  return v_deleted;
end;
$$;

revoke all on function public.get_private_media_access(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.reserve_media_request_attempt(text, text)
from public, anon, authenticated, service_role;
revoke all on function public.cleanup_private_media_delivery_counters()
from public, anon, authenticated, service_role;
grant execute on function public.get_private_media_access(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) to service_role;
grant execute on function public.reserve_media_request_attempt(text, text)
to service_role;
grant execute on function public.cleanup_private_media_delivery_counters()
to service_role;
