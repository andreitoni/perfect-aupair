-- Keep already-rejected catalog traffic read-only.  The reservation RPC must
-- not turn an attacker’s denied requests into unbounded WAL, row churn, or
-- integer growth.  A request is admitted only when all three dimensions can
-- be incremented atomically under the established global -> prefix -> IP lock
-- order.

create or replace function public.reserve_public_catalog_request(
  p_ip_hash text,
  p_ip_prefix_hash text,
  p_scope text
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '1s'
set lock_timeout = '250ms'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz := date_trunc('minute', v_now);
  v_ip_slot smallint;
  v_prefix_slot smallint;
  v_global_slot smallint;
  v_ip_count integer;
  v_prefix_count integer;
  v_global_count integer;
  v_ip_window timestamptz;
  v_prefix_window timestamptz;
  v_global_window timestamptz;
  v_ip_limit integer;
  v_prefix_limit integer;
  v_global_limit integer;
  v_retry_after integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_scope not in ('search', 'count', 'landing')
    or coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_ip_prefix_hash, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid public catalog rate-limit input'
      using errcode = '22023';
  end if;

  case p_scope
    when 'search' then
      v_ip_limit := 16;
      v_prefix_limit := 256;
      v_global_limit := 16;
    when 'count' then
      v_ip_limit := 32;
      v_prefix_limit := 512;
      v_global_limit := 32;
    when 'landing' then
      v_ip_limit := 8;
      v_prefix_limit := 128;
      v_global_limit := 8;
  end case;

  v_ip_slot := (
    (hashtextextended(p_scope || ':ip:' || p_ip_hash, 0)
      & 9223372036854775807) % 2048
  )::smallint;
  v_prefix_slot := (
    (hashtextextended(p_scope || ':prefix:' || p_ip_prefix_hash, 0)
      & 9223372036854775807) % 512
  )::smallint;
  v_global_slot := (
    (hashtextextended(p_scope || ':global:' || p_ip_hash, 0)
      & 9223372036854775807) % 64
  )::smallint;

  -- Read-only fast path for the common rejection storm. It may reject
  -- conservatively when a concurrent request is about to roll the window, but
  -- a possible allow always proceeds through the locked recheck below.
  select counter.request_count, counter.window_started_at
  into v_global_count, v_global_window
  from public.public_catalog_request_counters counter
  where counter.request_scope = p_scope
    and counter.counter_kind = 'global_shard'
    and counter.slot_no = v_global_slot;

  select counter.request_count, counter.window_started_at
  into v_prefix_count, v_prefix_window
  from public.public_catalog_request_counters counter
  where counter.request_scope = p_scope
    and counter.counter_kind = 'prefix'
    and counter.slot_no = v_prefix_slot;

  select counter.request_count, counter.window_started_at
  into v_ip_count, v_ip_window
  from public.public_catalog_request_counters counter
  where counter.request_scope = p_scope
    and counter.counter_kind = 'ip'
    and counter.slot_no = v_ip_slot;

  if v_global_count is null or v_prefix_count is null or v_ip_count is null then
    raise exception 'Public catalog rate-limit slot unavailable';
  end if;

  if v_global_window > v_window_started_at
    or v_prefix_window > v_window_started_at
    or v_ip_window > v_window_started_at
  then
    raise exception 'Public catalog rate-limit window is in the future';
  end if;

  v_retry_after := least(
    60,
    greatest(
      1,
      ceil(extract(epoch from (
        v_window_started_at + interval '1 minute' - v_now
      )))::integer
    )
  );

  if (v_global_window = v_window_started_at and v_global_count >= v_global_limit)
    or (v_prefix_window = v_window_started_at and v_prefix_count >= v_prefix_limit)
    or (v_ip_window = v_window_started_at and v_ip_count >= v_ip_limit)
  then
    return query select false, v_retry_after;
    return;
  end if;

  -- Lock all dimensions in one order and re-read them. No UPDATE happens until
  -- every dimension is known to be below its limit.
  select counter.request_count, counter.window_started_at
  into v_global_count, v_global_window
  from public.public_catalog_request_counters counter
  where counter.request_scope = p_scope
    and counter.counter_kind = 'global_shard'
    and counter.slot_no = v_global_slot
  for update;

  select counter.request_count, counter.window_started_at
  into v_prefix_count, v_prefix_window
  from public.public_catalog_request_counters counter
  where counter.request_scope = p_scope
    and counter.counter_kind = 'prefix'
    and counter.slot_no = v_prefix_slot
  for update;

  select counter.request_count, counter.window_started_at
  into v_ip_count, v_ip_window
  from public.public_catalog_request_counters counter
  where counter.request_scope = p_scope
    and counter.counter_kind = 'ip'
    and counter.slot_no = v_ip_slot
  for update;

  v_now := pg_catalog.clock_timestamp();
  v_window_started_at := date_trunc('minute', v_now);

  if v_global_window > v_window_started_at
    or v_prefix_window > v_window_started_at
    or v_ip_window > v_window_started_at
  then
    raise exception 'Public catalog rate-limit window is in the future';
  end if;

  v_global_count := case when v_global_window = v_window_started_at
    then v_global_count else 0 end;
  v_prefix_count := case when v_prefix_window = v_window_started_at
    then v_prefix_count else 0 end;
  v_ip_count := case when v_ip_window = v_window_started_at
    then v_ip_count else 0 end;

  v_retry_after := least(
    60,
    greatest(
      1,
      ceil(extract(epoch from (
        v_window_started_at + interval '1 minute' - v_now
      )))::integer
    )
  );

  if v_global_count >= v_global_limit
    or v_prefix_count >= v_prefix_limit
    or v_ip_count >= v_ip_limit
  then
    return query select false, v_retry_after;
    return;
  end if;

  update public.public_catalog_request_counters
  set request_count = v_global_count + 1,
      window_started_at = v_window_started_at
  where request_scope = p_scope
    and counter_kind = 'global_shard'
    and slot_no = v_global_slot;

  update public.public_catalog_request_counters
  set request_count = v_prefix_count + 1,
      window_started_at = v_window_started_at
  where request_scope = p_scope
    and counter_kind = 'prefix'
    and slot_no = v_prefix_slot;

  update public.public_catalog_request_counters
  set request_count = v_ip_count + 1,
      window_started_at = v_window_started_at
  where request_scope = p_scope
    and counter_kind = 'ip'
    and slot_no = v_ip_slot;

  return query select true, 0;
end;
$$;

revoke all on function public.reserve_public_catalog_request(text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_public_catalog_request(text, text, text)
to service_role;

-- childcare_experience is public profile text and must be part of the same
-- exact revision that an admin sees and approves.
create or replace function public.profile_content_moderation_version(
  p_profile_id uuid
)
returns text
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat(
          pg_catalog.octet_length(coalesce(profile.full_name, ''))::text,
          ':', coalesce(profile.full_name, ''),
          pg_catalog.octet_length(coalesce(profile.first_name, ''))::text,
          ':', coalesce(profile.first_name, ''),
          pg_catalog.octet_length(coalesce(profile.last_name, ''))::text,
          ':', coalesce(profile.last_name, ''),
          pg_catalog.octet_length(coalesce(profile.bio, ''))::text,
          ':', coalesce(profile.bio, ''),
          pg_catalog.octet_length(coalesce(profile.childcare_experience, ''))::text,
          ':', coalesce(profile.childcare_experience, ''),
          pg_catalog.octet_length(coalesce(profile.children_info, ''))::text,
          ':', coalesce(profile.children_info, ''),
          pg_catalog.octet_length(coalesce(profile.accommodation_info, ''))::text,
          ':', coalesce(profile.accommodation_info, ''),
          pg_catalog.octet_length(coalesce(profile.expectations, ''))::text,
          ':', coalesce(profile.expectations, ''),
          coalesce((
            select pg_catalog.string_agg(
              pg_catalog.octet_length(photo.storage_path)::text
                || ':' || photo.storage_path,
              '' order by pg_catalog.convert_to(photo.storage_path, 'UTF8')
            )
            from public.profile_photos photo
            where photo.profile_id = profile.id
          ), '')
        ), 'UTF8'
      ), 'sha256'
    ), 'hex'
  )
  from public.profiles profile
  where profile.id = p_profile_id;
$$;

revoke all on function public.profile_content_moderation_version(uuid)
from public, anon, authenticated;
grant execute on function public.profile_content_moderation_version(uuid)
to service_role;

create or replace function public.mark_profile_public_content_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_actor_role = 'service_role' or coalesce(new.is_admin, false) then
    return new;
  end if;

  if old.full_name is distinct from new.full_name
    or old.first_name is distinct from new.first_name
    or old.last_name is distinct from new.last_name
    or old.bio is distinct from new.bio
    or old.childcare_experience is distinct from new.childcare_experience
    or old.children_info is distinct from new.children_info
    or old.accommodation_info is distinct from new.accommodation_info
    or old.expectations is distinct from new.expectations
  then
    new.content_moderation_status := 'pending';
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason := 'Public profile text changed and needs content review.';
  end if;

  return new;
end;
$$;

drop trigger if exists mark_profile_public_content_pending_trigger
on public.profiles;
create trigger mark_profile_public_content_pending_trigger
before update of full_name, first_name, last_name, bio, childcare_experience,
  children_info, accommodation_info, expectations
on public.profiles
for each row execute function public.mark_profile_public_content_pending();
