-- Serialize auth-email budgets across every dimension they count, and avoid
-- write amplification when the same profile pair is viewed repeatedly.

create or replace function public.lock_auth_email_request_dimensions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- record_auth_email_request aggregates signup and resend events together.
  -- Keep these keys action-free and acquire them in one stable order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'auth-email-rate:email:' || new.email_hash,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'auth-email-rate:ip:' || new.ip_hash,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'auth-email-rate:prefix:' || new.ip_prefix_hash,
      0
    )
  );

  return new;
end;
$$;

revoke all on function public.lock_auth_email_request_dimensions()
from public, anon, authenticated, service_role;

drop trigger if exists auth_email_request_dimensions_lock
on public.auth_email_request_events;

create trigger auth_email_request_dimensions_lock
before insert on public.auth_email_request_events
for each row execute function public.lock_auth_email_request_dimensions();

-- Keep the trigger responsible only for serialization. The previous
-- RETURN NULL optimization could make the caller recompute a now-lower rolling
-- count and allow an attempt while the saved block was still active.
create or replace function public.serialize_security_rate_limit_event_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'security-rate:subject:' || new.action || ':' || new.subject_hash,
        0
      )
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-rate:ip:' || new.action || ':' || new.ip_hash,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-rate:prefix:' || new.action || ':' || new.ip_prefix_hash,
      0
    )
  );

  return new;
end;
$$;

revoke all on function public.serialize_security_rate_limit_event_insert()
from public, anon, authenticated, service_role;

-- Preserve the existing calculator as a private implementation and put the
-- active-block decision in front of its INSERT. This keeps blocked traffic
-- bounded without relying on a row-suppressing trigger.
alter function public.record_security_rate_limit_event(text, text, text, text, text)
rename to record_security_rate_limit_event_unchecked;

revoke all on function public.record_security_rate_limit_event_unchecked(
  text,
  text,
  text,
  text,
  text
)
from public, anon, authenticated, service_role;

create or replace function public.record_security_rate_limit_event(
  p_action text,
  p_subject_hash text,
  p_ip_hash text,
  p_ip_prefix_hash text,
  p_user_agent_hash text default null
)
returns table (
  allowed boolean,
  challenge_required boolean,
  retry_after_seconds integer,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block_expires_at timestamptz;
  v_block_reason text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_retry integer;
begin
  if p_subject_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'security-rate:subject:' || p_action || ':' || p_subject_hash,
        0
      )
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-rate:ip:' || p_action || ':' || p_ip_hash,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-rate:prefix:' || p_action || ':' || p_ip_prefix_hash,
      0
    )
  );

  select
    event.created_at
      + pg_catalog.make_interval(secs => event.retry_after_seconds),
    event.reason
  into v_block_expires_at, v_block_reason
  from public.security_rate_limit_events event
  where event.action = p_action
    and event.blocked
    and event.retry_after_seconds is not null
    and event.created_at
      + pg_catalog.make_interval(secs => event.retry_after_seconds)
      > v_now
    and (
      (
        event.reason = 'subject_limit'
        and p_subject_hash is not null
        and event.subject_hash = p_subject_hash
      )
      or (
        event.reason = 'ip_limit'
        and event.ip_hash = p_ip_hash
      )
      or (
        event.reason = 'ip_prefix_limit'
        and event.ip_prefix_hash = p_ip_prefix_hash
      )
    )
  order by
    event.created_at
      + pg_catalog.make_interval(secs => event.retry_after_seconds) desc
  limit 1;

  if v_block_expires_at is not null then
    v_retry := greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from (v_block_expires_at - v_now))
      )::integer
    );

    return query
    select false, false, v_retry, v_block_reason;
    return;
  end if;

  return query
  select result.allowed,
         result.challenge_required,
         result.retry_after_seconds,
         result.reason
  from public.record_security_rate_limit_event_unchecked(
    p_action,
    p_subject_hash,
    p_ip_hash,
    p_ip_prefix_hash,
    p_user_agent_hash
  ) result;
end;
$$;

revoke all on function public.record_security_rate_limit_event(
  text,
  text,
  text,
  text,
  text
)
from public, anon, authenticated, service_role;
grant execute on function public.record_security_rate_limit_event(
  text,
  text,
  text,
  text,
  text
)
to service_role;

create or replace function public.record_profile_view(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := (select auth.uid());
  v_viewer_type text;
  v_target_type text;
  v_inserted boolean := false;
  v_recent_nudge_count integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_viewer_id is null
    or p_profile_id is null
    or v_viewer_id = p_profile_id
  then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-view-nudge:' || v_viewer_id::text,
      0
    )
  );

  select profile.account_type into v_viewer_type
  from public.profiles profile
  where profile.id = v_viewer_id
    and public.public_profile_is_eligible(profile.id, true);

  select profile.account_type into v_target_type
  from public.profiles profile
  where profile.id = p_profile_id
    and public.public_profile_is_eligible(profile.id, true);

  if v_viewer_type is null
    or v_target_type is null
    or v_viewer_type = v_target_type
    or public.profile_pair_blocked(v_viewer_id, p_profile_id)
  then
    return false;
  end if;

  insert into public.profile_views (
    viewer_id,
    profile_id,
    first_viewed_at,
    last_viewed_at,
    view_count
  ) values (
    v_viewer_id,
    p_profile_id,
    v_now,
    v_now,
    1
  )
  on conflict (viewer_id, profile_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    update public.profile_views
    set
      last_viewed_at = v_now,
      view_count = least(public.profile_views.view_count + 1, 2147483647)
    where viewer_id = v_viewer_id
      and profile_id = p_profile_id
      and last_viewed_at <= v_now - interval '5 minutes';

    return false;
  end if;

  if v_viewer_type <> 'family' or v_target_type <> 'au_pair' then
    return false;
  end if;

  if exists (
    select 1
    from public.conversations conversation
    where conversation.family_id = v_viewer_id
      and conversation.au_pair_id = p_profile_id
  ) or exists (
    select 1
    from public.profile_favorites favorite
    where favorite.user_id = v_viewer_id
      and favorite.profile_id = p_profile_id
  ) then
    return false;
  end if;

  select pg_catalog.count(*)::integer
  into v_recent_nudge_count
  from public.profile_views view_event
  join public.profiles target on target.id = view_event.profile_id
  where view_event.viewer_id = v_viewer_id
    and target.account_type = 'au_pair'
    and view_event.first_viewed_at >= v_now - interval '24 hours';

  return v_recent_nudge_count <= 10;
end;
$$;

revoke all on function public.record_profile_view(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_profile_view(uuid)
to authenticated;
