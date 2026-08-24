-- Hold optional first-message emails between 21:00 and 08:00 in the
-- recipient's market timezone, then send at most one unread-message digest.
-- Activity after the newest queued message suppresses the digest because the
-- member has already returned to the product.

create table public.message_digest_email_deliveries (
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  digest_date date not null,
  delivery_id uuid not null default gen_random_uuid(),
  time_zone text not null,
  due_at timestamptz not null,
  first_message_at timestamptz not null,
  latest_message_at timestamptz not null,
  claim_token uuid,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  suppressed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (recipient_id, digest_date),
  unique (delivery_id),
  constraint message_digest_email_delivery_state_check
    check (not (sent_at is not null and suppressed_at is not null))
);

create index message_digest_email_due_idx
on public.message_digest_email_deliveries (due_at, recipient_id)
where sent_at is null and suppressed_at is null;

alter table public.message_digest_email_deliveries enable row level security;
revoke all on table public.message_digest_email_deliveries
from public, anon, authenticated;
grant select, insert, update, delete
on table public.message_digest_email_deliveries to service_role;

create or replace function public.message_notification_timezone(p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(pg_catalog.btrim(coalesce(p_country, '')))
    when 'germany' then 'Europe/Berlin'
    when 'de' then 'Europe/Berlin'
    when 'deutschland' then 'Europe/Berlin'
    when 'united kingdom' then 'Europe/London'
    when 'uk' then 'Europe/London'
    when 'gb' then 'Europe/London'
    when 'great britain' then 'Europe/London'
    when 'united states' then 'America/New_York'
    when 'united states of america' then 'America/New_York'
    when 'usa' then 'America/New_York'
    when 'us' then 'America/New_York'
    else 'UTC'
  end;
$$;

revoke all on function public.message_notification_timezone(text)
from public, anon, authenticated, service_role;

create or replace function public.schedule_message_notification_delivery(
  p_recipient_id uuid,
  p_message_id uuid,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.clock_timestamp());
  v_message_at timestamptz;
  v_country text;
  v_last_active_at timestamptz;
  v_timezone text;
  v_local_now timestamp;
  v_digest_date date;
  v_due_at timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_recipient_id is null or p_message_id is null then
    return 'suppressed';
  end if;

  select
    coalesce(message.sent_at, message.created_at),
    profile.country,
    profile.last_active_at
  into v_message_at, v_country, v_last_active_at
  from public.messages message
  join public.conversations conversation
    on conversation.id = message.conversation_id
  join public.profiles profile
    on profile.id = p_recipient_id
  where message.id = p_message_id
    and message.sender_id <> p_recipient_id
    and (
      conversation.family_id = p_recipient_id
      or conversation.au_pair_id = p_recipient_id
    )
    and profile.onboarding_completed is true
    and profile.suspended_at is null
    and profile.deletion_requested_at is null
    and profile.is_admin is not true
    and profile.new_message_emails_enabled is true
    and coalesce((
      select flag.enabled
      from public.feature_flags flag
      where flag.key = 'engagement_emails'
    ), false);

  if v_message_at is null then
    return 'suppressed';
  end if;

  if v_last_active_at is not null and v_last_active_at >= v_message_at then
    return 'suppressed_active';
  end if;

  v_timezone := public.message_notification_timezone(v_country);
  v_local_now := v_now at time zone v_timezone;

  if extract(hour from v_local_now) >= 21 then
    v_digest_date := v_local_now::date + 1;
  elsif extract(hour from v_local_now) < 8 then
    v_digest_date := v_local_now::date;
  else
    return 'immediate';
  end if;

  v_due_at := (v_digest_date::timestamp + time '08:00') at time zone v_timezone;

  insert into public.message_digest_email_deliveries (
    recipient_id,
    digest_date,
    time_zone,
    due_at,
    first_message_at,
    latest_message_at
  ) values (
    p_recipient_id,
    v_digest_date,
    v_timezone,
    v_due_at,
    v_message_at,
    v_message_at
  )
  on conflict (recipient_id, digest_date)
  do update set
    first_message_at = least(
      public.message_digest_email_deliveries.first_message_at,
      excluded.first_message_at
    ),
    latest_message_at = greatest(
      public.message_digest_email_deliveries.latest_message_at,
      excluded.latest_message_at
    ),
    updated_at = v_now;

  return 'queued_digest';
end;
$$;

revoke all on function public.schedule_message_notification_delivery(uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.schedule_message_notification_delivery(uuid, uuid, timestamptz)
to service_role;

create or replace function public.claim_message_digest_email_deliveries(
  p_batch_size integer default 25,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  recipient_id uuid,
  delivery_id uuid,
  claim_token uuid,
  first_name text,
  full_name text,
  latest_message_at timestamptz,
  unread_message_count integer,
  unread_conversation_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_size integer := least(greatest(coalesce(p_batch_size, 25), 1), 50);
  v_now timestamptz := coalesce(p_now, pg_catalog.clock_timestamp());
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.message_digest_email_deliveries delivery
  set
    suppressed_at = v_now,
    updated_at = v_now,
    claim_token = null,
    claim_expires_at = null
  from public.profiles profile
  where profile.id = delivery.recipient_id
    and delivery.due_at <= v_now
    and delivery.sent_at is null
    and delivery.suppressed_at is null
    and (
      profile.onboarding_completed is not true
      or profile.new_message_emails_enabled is not true
      or profile.is_admin is true
      or profile.suspended_at is not null
      or profile.deletion_requested_at is not null
      or profile.last_active_at >= delivery.latest_message_at
    );

  return query
  with claimable as (
    select delivery.recipient_id, delivery.digest_date
    from public.message_digest_email_deliveries delivery
    join public.profiles profile on profile.id = delivery.recipient_id
    where delivery.due_at <= v_now
      and delivery.sent_at is null
      and delivery.suppressed_at is null
      and delivery.attempt_count < 5
      and (
        delivery.claim_token is null
        or delivery.claim_expires_at is null
        or delivery.claim_expires_at <= v_now
      )
      and profile.onboarding_completed is true
      and profile.new_message_emails_enabled is true
      and profile.is_admin is not true
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and (
        profile.last_active_at is null
        or profile.last_active_at < delivery.latest_message_at
      )
    order by delivery.due_at, delivery.recipient_id
    limit v_batch_size
    for update of delivery skip locked
  ), claimed as (
    update public.message_digest_email_deliveries delivery
    set
      claim_token = gen_random_uuid(),
      claim_expires_at = v_now + interval '15 minutes',
      attempt_count = delivery.attempt_count + 1,
      last_attempt_at = v_now,
      updated_at = v_now
    from claimable
    where delivery.recipient_id = claimable.recipient_id
      and delivery.digest_date = claimable.digest_date
    returning delivery.recipient_id, delivery.delivery_id, delivery.claim_token
  )
  select
    claimed.recipient_id,
    claimed.delivery_id,
    claimed.claim_token,
    profile.first_name,
    profile.full_name,
    delivery_state.latest_message_at,
    unread.message_count,
    unread.conversation_count
  from claimed
  join public.profiles profile on profile.id = claimed.recipient_id
  join public.message_digest_email_deliveries delivery_state
    on delivery_state.delivery_id = claimed.delivery_id
  cross join lateral (
    select
      pg_catalog.count(message.id)::integer as message_count,
      pg_catalog.count(distinct message.conversation_id)::integer as conversation_count
    from public.conversations conversation
    join public.messages message on message.conversation_id = conversation.id
    left join public.conversation_reads read_state
      on read_state.user_id = claimed.recipient_id
      and read_state.conversation_id = conversation.id
    where (
      conversation.family_id = claimed.recipient_id
      or conversation.au_pair_id = claimed.recipient_id
    )
      and message.sender_id <> claimed.recipient_id
      and message.created_at > coalesce(
        read_state.last_read_at,
        timestamptz '1970-01-01 00:00:00+00'
      )
  ) unread;
end;
$$;

create or replace function public.complete_message_digest_email_delivery(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_completed_at timestamptz default pg_catalog.clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed boolean;
  v_now timestamptz := coalesce(p_completed_at, pg_catalog.clock_timestamp());
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_outcome not in ('sent', 'suppressed') then
    return false;
  end if;

  update public.message_digest_email_deliveries
  set
    sent_at = case when p_outcome = 'sent' then v_now else null end,
    suppressed_at = case when p_outcome = 'suppressed' then v_now else null end,
    claim_token = null,
    claim_expires_at = null,
    updated_at = v_now
  where recipient_id = p_recipient_id
    and claim_token = p_claim_token
    and sent_at is null
    and suppressed_at is null
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create or replace function public.release_message_digest_email_delivery(
  p_recipient_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.message_digest_email_deliveries
  set
    claim_token = null,
    claim_expires_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where recipient_id = p_recipient_id
    and claim_token = p_claim_token
    and sent_at is null
    and suppressed_at is null
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_message_digest_email_deliveries(integer, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.complete_message_digest_email_delivery(uuid, uuid, text, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.release_message_digest_email_delivery(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.claim_message_digest_email_deliveries(integer, timestamptz)
to service_role;
grant execute on function public.complete_message_digest_email_delivery(uuid, uuid, text, timestamptz)
to service_role;
grant execute on function public.release_message_digest_email_delivery(uuid, uuid)
to service_role;
