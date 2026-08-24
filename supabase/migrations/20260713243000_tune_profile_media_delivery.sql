-- Count only authorized, existing photo requests. The initial circuit breaker
-- was low enough for normal card traffic to disable images globally.

alter table public.profile_media_delivery_counters
add column if not exists byte_count bigint not null default 0
check (byte_count >= 0);

create or replace function public.get_profile_photo_media_access(
  p_storage_path text,
  p_viewer_id uuid,
  p_is_admin boolean,
  p_ip_hash text,
  p_ip_prefix_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  storage_path text
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
  v_ip_count integer;
  v_ip_bytes bigint;
  v_prefix_count integer;
  v_prefix_bytes bigint;
  v_hour_count integer;
  v_hour_bytes bigint;
  v_day_count integer;
  v_day_bytes bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_storage_path is null
    or pg_catalog.char_length(p_storage_path) not between 3 and 1024
    or p_ip_hash is null
    or p_ip_prefix_hash is null
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_ip_prefix_hash !~ '^[0-9a-f]{64}$'
  then
    return query select false, 600, null::text;
    return;
  end if;

  select photo.storage_path
  into v_authorized_path
  from public.profile_photos photo
  join public.profiles owner_profile on owner_profile.id = photo.profile_id
  where photo.storage_path = p_storage_path
    and (storage.foldername(photo.storage_path))[1] = photo.profile_id::text
    and (
      coalesce(p_is_admin, false)
      or public.database_feature_flag_enabled('private_media_delivery')
    )
    and (
      p_viewer_id = owner_profile.id
      or coalesce(p_is_admin, false)
      or (
        owner_profile.onboarding_completed = true
        and owner_profile.public_slug is not null
        and owner_profile.suspended_at is null
        and owner_profile.deletion_requested_at is null
        and owner_profile.deletion_scheduled_at is null
        and coalesce(owner_profile.is_admin, false) = false
        and owner_profile.content_moderation_status = 'approved'
      )
    )
    and (
      p_viewer_id is null
      or p_viewer_id = owner_profile.id
      or coalesce(p_is_admin, false)
      or not public.profile_pair_blocked(p_viewer_id, owner_profile.id)
    )
  limit 1;

  if v_authorized_path is null then
    return;
  end if;

  select public.storage_object_size_bytes(object.metadata)
  into v_object_size
  from storage.objects object
  where object.bucket_id = 'profile-photos'
    and object.name = v_authorized_path
  limit 1;

  if v_object_size is null or v_object_size <= 0 then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('profile-media:global-day:' || v_day::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('profile-media:global-hour:' || v_hour::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-media:prefix:' || p_ip_prefix_hash || ':' || v_ten_minute::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-media:ip:' || p_ip_hash || ':' || v_ten_minute::text,
      0
    )
  );

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_ip_count, v_ip_bytes
  from public.profile_media_delivery_counters counter
  where counter.scope = 'ip_10m'
    and counter.identity_hash = p_ip_hash
    and counter.window_started_at = v_ten_minute;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_prefix_count, v_prefix_bytes
  from public.profile_media_delivery_counters counter
  where counter.scope = 'prefix_10m'
    and counter.identity_hash = p_ip_prefix_hash
    and counter.window_started_at = v_ten_minute;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_hour_count, v_hour_bytes
  from public.profile_media_delivery_counters counter
  where counter.scope = 'global_hour'
    and counter.identity_hash = 'all'
    and counter.window_started_at = v_hour;

  select coalesce(counter.request_count, 0), coalesce(counter.byte_count, 0)
  into v_day_count, v_day_bytes
  from public.profile_media_delivery_counters counter
  where counter.scope = 'global_day'
    and counter.identity_hash = 'all'
    and counter.window_started_at = v_day;

  v_ip_count := coalesce(v_ip_count, 0);
  v_ip_bytes := coalesce(v_ip_bytes, 0);
  v_prefix_count := coalesce(v_prefix_count, 0);
  v_prefix_bytes := coalesce(v_prefix_bytes, 0);
  v_hour_count := coalesce(v_hour_count, 0);
  v_hour_bytes := coalesce(v_hour_bytes, 0);
  v_day_count := coalesce(v_day_count, 0);
  v_day_bytes := coalesce(v_day_bytes, 0);

  if v_ip_count + 1 > 2000
    or v_ip_bytes + v_object_size > 500::bigint * 1024 * 1024
    or v_prefix_count + 1 > 8000
    or v_prefix_bytes + v_object_size > 2::bigint * 1024 * 1024 * 1024
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_ten_minute + interval '10 minutes' - v_now
      )))::integer
    ), null::text;
    return;
  end if;

  if v_hour_count + 1 > 100000
    or v_hour_bytes + v_object_size > 10::bigint * 1024 * 1024 * 1024
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_hour + interval '1 hour' - v_now
      )))::integer
    ), null::text;
    return;
  end if;

  if v_day_count + 1 > 500000
    or v_day_bytes + v_object_size > 50::bigint * 1024 * 1024 * 1024
  then
    return query select false, greatest(
      1,
      pg_catalog.ceil(extract(epoch from (
        v_day + interval '1 day' - v_now
      )))::integer
    ), null::text;
    return;
  end if;

  insert into public.profile_media_delivery_counters (
    scope, identity_hash, window_started_at, request_count, byte_count
  ) values
    ('ip_10m', p_ip_hash, v_ten_minute, 1, v_object_size),
    ('prefix_10m', p_ip_prefix_hash, v_ten_minute, 1, v_object_size),
    ('global_hour', 'all', v_hour, 1, v_object_size),
    ('global_day', 'all', v_day, 1, v_object_size)
  on conflict (scope, identity_hash, window_started_at) do update
  set
    request_count = profile_media_delivery_counters.request_count + 1,
    byte_count = profile_media_delivery_counters.byte_count + excluded.byte_count;

  return query select true, 0, v_authorized_path;
end;
$$;

revoke all on function public.get_profile_photo_media_access(
  text, uuid, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_profile_photo_media_access(
  text, uuid, boolean, text, text
) to service_role;
