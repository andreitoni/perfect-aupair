create table if not exists public.auth_email_request_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('signup_confirmation', 'resend_confirmation')),
  email_hash text not null check (char_length(email_hash) between 32 and 128),
  email_domain text not null check (char_length(email_domain) between 1 and 255),
  ip_hash text not null check (char_length(ip_hash) between 32 and 128),
  ip_prefix_hash text not null check (char_length(ip_prefix_hash) between 32 and 128),
  user_agent_hash text check (user_agent_hash is null or char_length(user_agent_hash) between 32 and 128),
  blocked boolean not null default false,
  block_reason text,
  retry_after_seconds integer check (retry_after_seconds is null or retry_after_seconds >= 0),
  created_at timestamptz not null default now()
);

alter table public.auth_email_request_events enable row level security;

create index if not exists auth_email_request_events_created_at_idx
on public.auth_email_request_events (created_at);

create index if not exists auth_email_request_events_email_hash_created_at_idx
on public.auth_email_request_events (email_hash, created_at desc);

create index if not exists auth_email_request_events_ip_hash_created_at_idx
on public.auth_email_request_events (ip_hash, created_at desc);

create index if not exists auth_email_request_events_ip_prefix_created_at_idx
on public.auth_email_request_events (ip_prefix_hash, created_at desc);

create index if not exists auth_email_request_events_domain_ip_prefix_created_at_idx
on public.auth_email_request_events (email_domain, ip_prefix_hash, created_at desc);

revoke all on table public.auth_email_request_events from anon, authenticated;
grant select, insert, update, delete on table public.auth_email_request_events to service_role;

create or replace function public.record_auth_email_request(
  p_action text,
  p_email_hash text,
  p_email_domain text,
  p_ip_hash text,
  p_ip_prefix_hash text,
  p_user_agent_hash text default null
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_event_id uuid;
  v_count integer := 0;
  v_distinct_count integer := 0;
  v_oldest timestamptz;
  v_retry integer := 0;
  v_reason text;
begin
  if p_action not in ('signup_confirmation', 'resend_confirmation') then
    raise exception 'Unsupported auth email request action.';
  end if;

  delete from public.auth_email_request_events
  where created_at < v_now - interval '30 days';

  insert into public.auth_email_request_events (
    action,
    email_hash,
    email_domain,
    ip_hash,
    ip_prefix_hash,
    user_agent_hash
  )
  values (
    p_action,
    p_email_hash,
    lower(p_email_domain),
    p_ip_hash,
    p_ip_prefix_hash,
    p_user_agent_hash
  )
  returning id into v_event_id;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.auth_email_request_events
  where email_hash = p_email_hash
    and created_at > v_now - interval '1 minute';

  if v_count > 1 then
    v_reason := coalesce(v_reason, 'email_minute');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '1 minute') - v_now)))::integer
    );
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.auth_email_request_events
  where email_hash = p_email_hash
    and created_at > v_now - interval '1 hour';

  if v_count > 3 then
    v_reason := coalesce(v_reason, 'email_hour');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '1 hour') - v_now)))::integer
    );
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.auth_email_request_events
  where email_hash = p_email_hash
    and created_at > v_now - interval '1 day';

  if v_count > 6 then
    v_reason := coalesce(v_reason, 'email_day');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '1 day') - v_now)))::integer
    );
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.auth_email_request_events
  where ip_hash = p_ip_hash
    and created_at > v_now - interval '10 minutes';

  if v_count > 5 then
    v_reason := coalesce(v_reason, 'ip_10_minutes');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '10 minutes') - v_now)))::integer
    );
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.auth_email_request_events
  where ip_hash = p_ip_hash
    and created_at > v_now - interval '1 hour';

  if v_count > 15 then
    v_reason := coalesce(v_reason, 'ip_hour');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '1 hour') - v_now)))::integer
    );
  end if;

  select count(distinct email_hash), min(created_at)
  into v_distinct_count, v_oldest
  from public.auth_email_request_events
  where ip_hash = p_ip_hash
    and created_at > v_now - interval '10 minutes';

  if v_distinct_count > 5 then
    v_reason := coalesce(v_reason, 'ip_many_emails_10_minutes');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '10 minutes') - v_now)))::integer
    );
  end if;

  select count(distinct email_hash), min(created_at)
  into v_distinct_count, v_oldest
  from public.auth_email_request_events
  where ip_hash = p_ip_hash
    and created_at > v_now - interval '1 hour';

  if v_distinct_count > 12 then
    v_reason := coalesce(v_reason, 'ip_many_emails_hour');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '1 hour') - v_now)))::integer
    );
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.auth_email_request_events
  where ip_prefix_hash = p_ip_prefix_hash
    and created_at > v_now - interval '1 hour';

  if v_count > 20 then
    v_reason := coalesce(v_reason, 'ip_prefix_hour');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '1 hour') - v_now)))::integer
    );
  end if;

  select count(distinct email_hash), min(created_at)
  into v_distinct_count, v_oldest
  from public.auth_email_request_events
  where ip_prefix_hash = p_ip_prefix_hash
    and email_domain = lower(p_email_domain)
    and created_at > v_now - interval '1 hour';

  if v_distinct_count > 8 then
    v_reason := coalesce(v_reason, 'ip_prefix_many_domain_emails_hour');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + interval '1 hour') - v_now)))::integer
    );
  end if;

  if v_reason is not null then
    v_retry := greatest(v_retry, 60);

    update public.auth_email_request_events
    set blocked = true,
        block_reason = v_reason,
        retry_after_seconds = v_retry
    where id = v_event_id;

    return query select false, v_retry, v_reason;
    return;
  end if;

  return query select true, 0, null::text;
end;
$$;

revoke all on function public.record_auth_email_request(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_auth_email_request(text, text, text, text, text, text) to service_role;
