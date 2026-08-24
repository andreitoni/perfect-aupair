-- Keep media proxy rate limits fail-closed without one global hot row or
-- attacker-controlled counter cardinality. Counter identities are fixed hash
-- slots and the window rolls in place, so every table has a hard row ceiling.

truncate table public.media_request_attempt_counters;
truncate table public.profile_media_delivery_counters;
truncate table public.private_media_delivery_counters;

alter table public.media_request_attempt_counters
  drop constraint if exists media_request_attempt_counters_pkey,
  drop constraint if exists media_request_attempt_counters_identity_hash_check;
alter table public.media_request_attempt_counters
  add constraint media_request_attempt_counters_pkey
    primary key (scope, identity_hash),
  add constraint media_request_attempt_counters_fixed_slot_check check (
    identity_hash ~ '^s[0-9]{4}$'
    and (
      (scope = 'ip_10m' and identity_hash between 's0000' and 's2047')
      or (scope = 'prefix_10m' and identity_hash between 's0000' and 's0511')
      or (scope = 'global_10m' and identity_hash between 's0000' and 's0063')
    )
  );

alter table public.profile_media_delivery_counters
  drop constraint if exists profile_media_delivery_counters_pkey,
  drop constraint if exists profile_media_delivery_counters_identity_hash_check;
alter table public.profile_media_delivery_counters
  add constraint profile_media_delivery_counters_pkey
    primary key (scope, identity_hash),
  add constraint profile_media_delivery_counters_fixed_slot_check check (
    identity_hash ~ '^s[0-9]{4}$'
    and (
      (scope = 'ip_10m' and identity_hash between 's0000' and 's2047')
      or (scope = 'prefix_10m' and identity_hash between 's0000' and 's0511')
      or (scope in ('global_hour', 'global_day')
        and identity_hash between 's0000' and 's0031')
    )
  );

alter table public.private_media_delivery_counters
  drop constraint if exists private_media_delivery_counters_pkey,
  drop constraint if exists private_media_delivery_counters_identity_hash_check;
alter table public.private_media_delivery_counters
  add constraint private_media_delivery_counters_pkey
    primary key (bucket_id, scope, identity_hash),
  add constraint private_media_delivery_counters_fixed_slot_check check (
    identity_hash ~ '^s[0-9]{4}$'
    and (
      (
        scope in ('bucket_hour', 'bucket_day')
        and bucket_id in (
          'profile-stories',
          'profile-videos',
          'message-photos',
          'message-videos',
          'message-audio',
          'verification-selfies'
        )
      )
      or (
        scope not in ('bucket_hour', 'bucket_day')
        and bucket_id = '*'
      )
    )
    and (
      (scope = 'ip_10m' and identity_hash between 's0000' and 's2047')
      or (scope = 'prefix_10m' and identity_hash between 's0000' and 's0511')
      or (scope = 'viewer_10m' and identity_hash between 's0000' and 's2047')
      or (scope = 'viewer_day' and identity_hash between 's0000' and 's4095')
      or (scope in ('bucket_hour', 'bucket_day')
        and identity_hash between 's0000' and 's0015')
      or (scope in ('global_hour', 'global_day')
        and identity_hash between 's0000' and 's0031')
    )
  );

create or replace function public.fixed_media_counter_slot(
  p_identity text,
  p_namespace text,
  p_slot_count integer
)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case
    when p_slot_count between 1 and 9999 then
      's' || pg_catalog.lpad(
        pg_catalog.mod(
          pg_catalog.hashtextextended(p_namespace || ':' || p_identity, 0)::numeric
            + 9223372036854775808::numeric,
          p_slot_count
        )::integer::text,
        4,
        '0'
      )
    else null::text
  end;
$$;

revoke all on function public.fixed_media_counter_slot(text, text, integer)
from public, anon, authenticated, service_role;

create or replace function public.reserve_fixed_media_attempt_slot(
  p_scope text,
  p_identity_hash text,
  p_window_started_at timestamptz,
  p_request_limit bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '250ms'
as $$
declare
  v_previous_window timestamptz;
  v_request_count bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select counter.window_started_at, counter.request_count
  into v_previous_window, v_request_count
  from public.media_request_attempt_counters counter
  where counter.scope = p_scope
    and counter.identity_hash = p_identity_hash
  for update;

  if not found then
    return -1;
  end if;

  if v_previous_window is distinct from p_window_started_at then
    v_request_count := 0;
  end if;

  if v_request_count + 1 > p_request_limit then
    return 0;
  end if;

  update public.media_request_attempt_counters
  set
    window_started_at = p_window_started_at,
    request_count = v_request_count + 1
  where scope = p_scope
    and identity_hash = p_identity_hash;

  return 1;
exception
  when lock_not_available or deadlock_detected then
    return -1;
end;
$$;

create or replace function public.reserve_fixed_profile_media_slot(
  p_scope text,
  p_identity_hash text,
  p_window_started_at timestamptz,
  p_request_limit bigint,
  p_byte_limit bigint,
  p_charge_bytes bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '250ms'
as $$
declare
  v_previous_window timestamptz;
  v_request_count bigint;
  v_byte_count bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select counter.window_started_at, counter.request_count, counter.byte_count
  into v_previous_window, v_request_count, v_byte_count
  from public.profile_media_delivery_counters counter
  where counter.scope = p_scope
    and counter.identity_hash = p_identity_hash
  for update;

  if not found then
    return -1;
  end if;

  if v_previous_window is distinct from p_window_started_at then
    v_request_count := 0;
    v_byte_count := 0;
  end if;

  if v_request_count + 1 > p_request_limit
    or v_byte_count + p_charge_bytes > p_byte_limit
  then
    return 0;
  end if;

  update public.profile_media_delivery_counters
  set
    window_started_at = p_window_started_at,
    request_count = v_request_count + 1,
    byte_count = v_byte_count + p_charge_bytes
  where scope = p_scope
    and identity_hash = p_identity_hash;

  return 1;
exception
  when lock_not_available or deadlock_detected then
    return -1;
end;
$$;

create or replace function public.reserve_fixed_private_media_slot(
  p_bucket_id text,
  p_scope text,
  p_identity_hash text,
  p_window_started_at timestamptz,
  p_request_limit bigint,
  p_byte_limit bigint,
  p_charge_bytes bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '250ms'
as $$
declare
  v_previous_window timestamptz;
  v_request_count bigint;
  v_byte_count bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select counter.window_started_at, counter.request_count, counter.byte_count
  into v_previous_window, v_request_count, v_byte_count
  from public.private_media_delivery_counters counter
  where counter.bucket_id = p_bucket_id
    and counter.scope = p_scope
    and counter.identity_hash = p_identity_hash
  for update;

  if not found then
    return -1;
  end if;

  if v_previous_window is distinct from p_window_started_at then
    v_request_count := 0;
    v_byte_count := 0;
  end if;

  if v_request_count + 1 > p_request_limit
    or v_byte_count + p_charge_bytes > p_byte_limit
  then
    return 0;
  end if;

  update public.private_media_delivery_counters
  set
    window_started_at = p_window_started_at,
    request_count = v_request_count + 1,
    byte_count = v_byte_count + p_charge_bytes
  where bucket_id = p_bucket_id
    and scope = p_scope
    and identity_hash = p_identity_hash;

  return 1;
exception
  when lock_not_available or deadlock_detected then
    return -1;
end;
$$;

revoke all on function public.reserve_fixed_media_attempt_slot(
  text, text, timestamptz, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.reserve_fixed_profile_media_slot(
  text, text, timestamptz, bigint, bigint, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.reserve_fixed_private_media_slot(
  text, text, text, timestamptz, bigint, bigint, bigint
) from public, anon, authenticated, service_role;

-- Every valid slot exists before traffic starts. Request functions only roll a
-- slot's window and counters in place; they never create attacker-shaped rows.
insert into public.media_request_attempt_counters (
  scope, identity_hash, window_started_at, request_count
)
select 'ip_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0
from pg_catalog.generate_series(0, 2047) slot
union all
select 'prefix_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0
from pg_catalog.generate_series(0, 511) slot
union all
select 'global_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0
from pg_catalog.generate_series(0, 63) slot;

insert into public.profile_media_delivery_counters (
  scope, identity_hash, window_started_at, request_count, byte_count
)
select 'ip_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from pg_catalog.generate_series(0, 2047) slot
union all
select 'prefix_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from pg_catalog.generate_series(0, 511) slot
union all
select scope_name, 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from unnest(array['global_hour', 'global_day']) scope_name
cross join pg_catalog.generate_series(0, 31) slot;

insert into public.private_media_delivery_counters (
  bucket_id, scope, identity_hash, window_started_at, request_count, byte_count
)
select '*', 'ip_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from pg_catalog.generate_series(0, 2047) slot
union all
select '*', 'prefix_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from pg_catalog.generate_series(0, 511) slot
union all
select '*', 'viewer_10m', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from pg_catalog.generate_series(0, 2047) slot
union all
select '*', 'viewer_day', 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from pg_catalog.generate_series(0, 4095) slot
union all
select bucket_name, scope_name,
  's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from unnest(array[
  'profile-stories', 'profile-videos', 'message-photos', 'message-videos',
  'message-audio', 'verification-selfies'
]) bucket_name
cross join unnest(array['bucket_hour', 'bucket_day']) scope_name
cross join pg_catalog.generate_series(0, 15) slot
union all
select '*', scope_name, 's' || pg_catalog.lpad(slot::text, 4, '0'),
  timestamptz '2000-01-01 00:00:00+00', 0, 0
from unnest(array['global_hour', 'global_day']) scope_name
cross join pg_catalog.generate_series(0, 31) slot;

create or replace function public.profile_video_viewer_is_allowed(
  p_profile_id uuid,
  p_viewer_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
set statement_timeout = '2s'
as $$
begin
  if p_profile_id is null or p_viewer_id is null then
    return false;
  end if;

  if coalesce((select auth.role()), '') = 'authenticated'
    and p_viewer_id is distinct from (select auth.uid())
  then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles viewer_profile
    join public.profiles owner_profile on owner_profile.id = p_profile_id
    where viewer_profile.id = p_viewer_id
      and (
        coalesce(viewer_profile.is_admin, false)
        or (
          public.database_feature_flag_enabled('private_media_delivery')
          and public.public_profile_is_eligible(viewer_profile.id, true)
          and public.public_profile_is_eligible(owner_profile.id, true)
          and viewer_profile.account_type <> owner_profile.account_type
          and not public.profile_pair_blocked_internal(
            viewer_profile.id,
            owner_profile.id
          )
          and exists (
            select 1
            from public.profile_videos video
            where video.profile_id = owner_profile.id
              and video.content_moderation_status = 'approved'
          )
        )
      )
  );
end;
$$;

revoke all on function public.profile_video_viewer_is_allowed(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.profile_video_viewer_is_allowed(uuid, uuid)
to authenticated, service_role;

drop policy if exists "Eligible users can read profile video metadata"
on public.profile_videos;
create policy "Eligible users can read profile video metadata"
on public.profile_videos for select to authenticated
using (
  profile_id = (select auth.uid())
  or public.profile_video_viewer_is_allowed(
    profile_videos.profile_id,
    (select auth.uid())
  )
);

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
set lock_timeout = '250ms'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window timestamptz := pg_catalog.date_bin(
    interval '10 minutes', v_now, timestamptz '2000-01-01 00:00:00+00'
  );
  v_result integer;
  v_ip_slot text;
  v_prefix_slot text;
  v_global_slot text;
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

  v_ip_slot := public.fixed_media_counter_slot(
    p_ip_hash, 'attempt-ip', 2048
  );
  v_prefix_slot := public.fixed_media_counter_slot(
    p_ip_prefix_hash, 'attempt-prefix', 512
  );
  v_global_slot := public.fixed_media_counter_slot(
    p_ip_hash, 'attempt-global', 64
  );

  v_result := public.reserve_fixed_media_attempt_slot(
    'ip_10m', v_ip_slot, v_window, 600
  );
  if v_result <> 1 then
    return query select false, case
      when v_result = -1 then 1
      else greatest(1, pg_catalog.ceil(extract(epoch from (
        v_window + interval '10 minutes' - v_now
      )))::integer)
    end;
    return;
  end if;

  v_result := public.reserve_fixed_media_attempt_slot(
    'prefix_10m', v_prefix_slot, v_window, 2400
  );
  if v_result <> 1 then
    return query select false, case
      when v_result = -1 then 1
      else greatest(1, pg_catalog.ceil(extract(epoch from (
        v_window + interval '10 minutes' - v_now
      )))::integer)
    end;
    return;
  end if;

  -- 64 independent shards each receive 1/64 of the shared budget. Their
  -- aggregate maximum is 99,968, below the previous 100,000 hard cap.
  v_result := public.reserve_fixed_media_attempt_slot(
    'global_10m', v_global_slot, v_window, 1562
  );
  if v_result <> 1 then
    return query select false, case
      when v_result = -1 then 1
      else greatest(1, pg_catalog.ceil(extract(epoch from (
        v_window + interval '10 minutes' - v_now
      )))::integer)
    end;
    return;
  end if;

  return query select true, 0;
end;
$$;

revoke all on function public.reserve_media_request_attempt(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_media_request_attempt(text, text)
to service_role;

create or replace function public.cleanup_profile_media_delivery_counters()
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '250ms'
as $$
declare
  v_reset integer := 0;
  v_batch_reset integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  for v_batch in 1..2 loop
    with stale as (
      select counter.scope, counter.identity_hash
      from public.profile_media_delivery_counters counter
      where (
          (
            counter.scope in ('ip_10m', 'prefix_10m')
            and counter.window_started_at
              < pg_catalog.clock_timestamp() - interval '30 minutes'
          ) or (
            counter.scope = 'global_hour'
            and counter.window_started_at
              < pg_catalog.clock_timestamp() - interval '2 hours'
          ) or (
            counter.scope = 'global_day'
            and counter.window_started_at
              < pg_catalog.clock_timestamp() - interval '2 days'
          )
        )
        and (
          counter.window_started_at <> timestamptz '2000-01-01 00:00:00+00'
          or counter.request_count <> 0
          or counter.byte_count <> 0
        )
      order by counter.scope, counter.identity_hash
      for update skip locked
      limit 5000
    )
    update public.profile_media_delivery_counters counter
    set
      window_started_at = timestamptz '2000-01-01 00:00:00+00',
      request_count = 0,
      byte_count = 0
    from stale
    where counter.scope = stale.scope
      and counter.identity_hash = stale.identity_hash
      and (
        counter.window_started_at <> timestamptz '2000-01-01 00:00:00+00'
        or counter.request_count <> 0
        or counter.byte_count <> 0
      );

    get diagnostics v_batch_reset = row_count;
    v_reset := v_reset + v_batch_reset;
    exit when v_batch_reset < 5000;
  end loop;

  return v_reset;
end;
$$;

create or replace function public.cleanup_private_media_delivery_counters()
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '250ms'
as $$
declare
  v_reset integer := 0;
  v_batch_reset integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  for v_batch in 1..3 loop
    with stale as (
      select counter.bucket_id, counter.scope, counter.identity_hash
      from public.private_media_delivery_counters counter
      where (
          (
            counter.scope in ('ip_10m', 'prefix_10m', 'viewer_10m')
            and counter.window_started_at
              < pg_catalog.clock_timestamp() - interval '30 minutes'
          ) or (
            counter.scope in ('bucket_hour', 'global_hour')
            and counter.window_started_at
              < pg_catalog.clock_timestamp() - interval '2 hours'
          ) or (
            counter.scope in ('viewer_day', 'bucket_day', 'global_day')
            and counter.window_started_at
              < pg_catalog.clock_timestamp() - interval '2 days'
          )
        )
        and (
          counter.window_started_at <> timestamptz '2000-01-01 00:00:00+00'
          or counter.request_count <> 0
          or counter.byte_count <> 0
        )
      order by counter.bucket_id, counter.scope, counter.identity_hash
      for update skip locked
      limit 5000
    )
    update public.private_media_delivery_counters counter
    set
      window_started_at = timestamptz '2000-01-01 00:00:00+00',
      request_count = 0,
      byte_count = 0
    from stale
    where counter.bucket_id = stale.bucket_id
      and counter.scope = stale.scope
      and counter.identity_hash = stale.identity_hash
      and (
        counter.window_started_at <> timestamptz '2000-01-01 00:00:00+00'
        or counter.request_count <> 0
        or counter.byte_count <> 0
      );

    get diagnostics v_batch_reset = row_count;
    v_reset := v_reset + v_batch_reset;
    exit when v_batch_reset < 5000;
  end loop;

  for v_batch in 1..2 loop
    with stale as (
      select counter.scope, counter.identity_hash
      from public.media_request_attempt_counters counter
      where counter.window_started_at
          < pg_catalog.clock_timestamp() - interval '30 minutes'
        and (
          counter.window_started_at <> timestamptz '2000-01-01 00:00:00+00'
          or counter.request_count <> 0
        )
      order by counter.scope, counter.identity_hash
      for update skip locked
      limit 5000
    )
    update public.media_request_attempt_counters counter
    set
      window_started_at = timestamptz '2000-01-01 00:00:00+00',
      request_count = 0
    from stale
    where counter.scope = stale.scope
      and counter.identity_hash = stale.identity_hash
      and (
        counter.window_started_at <> timestamptz '2000-01-01 00:00:00+00'
        or counter.request_count <> 0
      );

    get diagnostics v_batch_reset = row_count;
    v_reset := v_reset + v_batch_reset;
    exit when v_batch_reset < 5000;
  end loop;

  return v_reset;
end;
$$;

revoke all on function public.cleanup_profile_media_delivery_counters()
from public, anon, authenticated, service_role;
revoke all on function public.cleanup_private_media_delivery_counters()
from public, anon, authenticated, service_role;
grant execute on function public.cleanup_profile_media_delivery_counters()
to service_role;
grant execute on function public.cleanup_private_media_delivery_counters()
to service_role;

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
set lock_timeout = '250ms'
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
  v_result integer;
  v_ip_slot text;
  v_prefix_slot text;
  v_distribution_identity text;
  v_global_hour_slot text;
  v_global_day_slot text;
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
      or not public.profile_pair_blocked_internal(
        p_viewer_id,
        owner_profile.id
      )
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

  v_ip_slot := public.fixed_media_counter_slot(
    p_ip_hash, 'profile-photo-ip', 2048
  );
  v_prefix_slot := public.fixed_media_counter_slot(
    p_ip_prefix_hash, 'profile-photo-prefix', 512
  );
  v_distribution_identity := p_ip_hash || ':' || v_authorized_path;
  v_global_hour_slot := public.fixed_media_counter_slot(
    v_distribution_identity, 'profile-photo-global-hour', 32
  );
  v_global_day_slot := public.fixed_media_counter_slot(
    v_distribution_identity, 'profile-photo-global-day', 32
  );

  v_result := public.reserve_fixed_profile_media_slot(
    'ip_10m', v_ip_slot, v_ten_minute,
    2000, 500::bigint * 1024 * 1024, v_object_size
  );
  if v_result <> 1 then
    return query select false, case
      when v_result = -1 then 1
      else greatest(1, pg_catalog.ceil(extract(epoch from (
        v_ten_minute + interval '10 minutes' - v_now
      )))::integer)
    end, null::text;
    return;
  end if;

  v_result := public.reserve_fixed_profile_media_slot(
    'prefix_10m', v_prefix_slot, v_ten_minute,
    8000, 2::bigint * 1024 * 1024 * 1024, v_object_size
  );
  if v_result <> 1 then
    return query select false, case
      when v_result = -1 then 1
      else greatest(1, pg_catalog.ceil(extract(epoch from (
        v_ten_minute + interval '10 minutes' - v_now
      )))::integer)
    end, null::text;
    return;
  end if;

  -- The old single global rows are split into 32 independent hard-cap shards.
  v_result := public.reserve_fixed_profile_media_slot(
    'global_hour', v_global_hour_slot, v_hour,
    3125, 320::bigint * 1024 * 1024, v_object_size
  );
  if v_result <> 1 then
    return query select false, case
      when v_result = -1 then 1
      else greatest(1, pg_catalog.ceil(extract(epoch from (
        v_hour + interval '1 hour' - v_now
      )))::integer)
    end, null::text;
    return;
  end if;

  v_result := public.reserve_fixed_profile_media_slot(
    'global_day', v_global_day_slot, v_day,
    15625, 1600::bigint * 1024 * 1024, v_object_size
  );
  if v_result <> 1 then
    return query select false, case
      when v_result = -1 then 1
      else greatest(1, pg_catalog.ceil(extract(epoch from (
        v_day + interval '1 day' - v_now
      )))::integer)
    end, null::text;
    return;
  end if;

  return query select true, 0, v_authorized_path;
end;
$$;

revoke all on function public.get_profile_photo_media_access(
  text, uuid, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_profile_photo_media_access(
  text, uuid, boolean, text, text
) to service_role;

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
set lock_timeout = '250ms'
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
  v_result integer;
  v_ip_slot text;
  v_prefix_slot text;
  v_viewer_ten_minute_slot text;
  v_viewer_day_slot text;
  v_distribution_identity text;
  v_bucket_hour_slot text;
  v_bucket_day_slot text;
  v_global_hour_slot text;
  v_global_day_slot text;
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
              and not public.profile_pair_blocked_internal(
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
          and public.public_profile_is_eligible(owner_profile.id, true)
          and exists (
            select 1
            from public.profiles viewer_profile
            where viewer_profile.id = p_viewer_id
              and public.public_profile_is_eligible(viewer_profile.id, true)
              and viewer_profile.account_type <> owner_profile.account_type
              and not public.profile_pair_blocked_internal(
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
    join public.conversations conversation
      on conversation.id = message.conversation_id
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
      v_bucket_hour_byte_limit := 128::bigint * 1024 * 1024;
      v_bucket_day_byte_limit := 640::bigint * 1024 * 1024;
    when 'profile-videos' then
      v_bucket_hour_byte_limit := 384::bigint * 1024 * 1024;
      v_bucket_day_byte_limit := 1920::bigint * 1024 * 1024;
    when 'message-photos' then
      v_bucket_hour_byte_limit := 128::bigint * 1024 * 1024;
      v_bucket_day_byte_limit := 640::bigint * 1024 * 1024;
    when 'message-videos' then
      v_bucket_hour_byte_limit := 640::bigint * 1024 * 1024;
      v_bucket_day_byte_limit := 3200::bigint * 1024 * 1024;
    when 'message-audio' then
      v_bucket_hour_byte_limit := 128::bigint * 1024 * 1024;
      v_bucket_day_byte_limit := 640::bigint * 1024 * 1024;
    when 'verification-selfies' then
      v_bucket_hour_byte_limit := 16::bigint * 1024 * 1024;
      v_bucket_day_byte_limit := 64::bigint * 1024 * 1024;
  end case;

  v_ip_slot := public.fixed_media_counter_slot(
    p_ip_hash, 'private-media-ip', 2048
  );
  v_prefix_slot := public.fixed_media_counter_slot(
    p_ip_prefix_hash, 'private-media-prefix', 512
  );
  v_viewer_ten_minute_slot := public.fixed_media_counter_slot(
    p_viewer_id::text, 'private-media-viewer-10m', 2048
  );
  v_viewer_day_slot := public.fixed_media_counter_slot(
    p_viewer_id::text, 'private-media-viewer-day', 4096
  );
  v_distribution_identity := p_viewer_id::text || ':' || p_ip_hash || ':'
    || v_authorized_path;
  v_bucket_hour_slot := public.fixed_media_counter_slot(
    v_distribution_identity, 'private-media-bucket-hour:' || p_bucket_id, 16
  );
  v_bucket_day_slot := public.fixed_media_counter_slot(
    v_distribution_identity, 'private-media-bucket-day:' || p_bucket_id, 16
  );
  v_global_hour_slot := public.fixed_media_counter_slot(
    v_distribution_identity, 'private-media-global-hour', 32
  );
  v_global_day_slot := public.fixed_media_counter_slot(
    v_distribution_identity, 'private-media-global-day', 32
  );

  v_result := public.reserve_fixed_private_media_slot(
    '*', 'ip_10m', v_ip_slot, v_ten_minute,
    600, 1024::bigint * 1024 * 1024, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_ten_minute + interval '10 minutes' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  v_result := public.reserve_fixed_private_media_slot(
    '*', 'prefix_10m', v_prefix_slot, v_ten_minute,
    2400, 8::bigint * 1024 * 1024 * 1024, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_ten_minute + interval '10 minutes' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  v_result := public.reserve_fixed_private_media_slot(
    '*', 'viewer_10m', v_viewer_ten_minute_slot, v_ten_minute,
    400, 1024::bigint * 1024 * 1024, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_ten_minute + interval '10 minutes' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  v_result := public.reserve_fixed_private_media_slot(
    '*', 'viewer_day', v_viewer_day_slot, v_day,
    4000, 5::bigint * 1024 * 1024 * 1024, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_day + interval '1 day' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  -- Bucket and global budgets are split into fixed shards. A skewed shard can
  -- fail early, but the aggregate can never exceed the former hard cap.
  v_result := public.reserve_fixed_private_media_slot(
    p_bucket_id, 'bucket_hour', v_bucket_hour_slot, v_hour,
    1250, v_bucket_hour_byte_limit, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_hour + interval '1 hour' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  v_result := public.reserve_fixed_private_media_slot(
    p_bucket_id, 'bucket_day', v_bucket_day_slot, v_day,
    6250, v_bucket_day_byte_limit, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_day + interval '1 day' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  v_result := public.reserve_fixed_private_media_slot(
    '*', 'global_hour', v_global_hour_slot, v_hour,
    1562, 640::bigint * 1024 * 1024, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_hour + interval '1 hour' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  v_result := public.reserve_fixed_private_media_slot(
    '*', 'global_day', v_global_day_slot, v_day,
    7812, 2400::bigint * 1024 * 1024, v_charge_bytes
  );
  if v_result <> 1 then
    return query select false, case when v_result = -1 then 1 else greatest(
      1, pg_catalog.ceil(extract(epoch from (
        v_day + interval '1 day' - v_now
      )))::integer
    ) end, null::text, v_object_size, v_charge_bytes;
    return;
  end if;

  return query
  select true, 0, v_authorized_path, v_object_size, v_charge_bytes;
end;
$$;

revoke all on function public.get_private_media_access(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.get_private_media_access(
  text, text, uuid, boolean, text, text, bigint, bigint, bigint
) to service_role;
