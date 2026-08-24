-- Keep first-message and favorite notification claims retryable until delivery
-- reaches a terminal state. Provider idempotency keys use delivery_id, while a
-- short-lived claim token prevents concurrent workers from sending duplicates.

alter table public.message_notification_claims
add column if not exists email_sent_at timestamptz,
add column if not exists email_claim_token uuid,
add column if not exists email_claim_expires_at timestamptz,
add column if not exists email_delivery_id uuid,
add column if not exists email_attempt_count integer not null default 0,
add column if not exists email_last_attempt_at timestamptz;

-- Older rows used email_claimed_at as the terminal sent marker.
update public.message_notification_claims
set email_sent_at = email_claimed_at
where email_sent_at is null
  and email_claimed_at is not null;

update public.message_notification_claims
set email_delivery_id = gen_random_uuid()
where email_delivery_id is null;

alter table public.message_notification_claims
alter column email_delivery_id set default gen_random_uuid(),
alter column email_delivery_id set not null;

alter table public.message_notification_claims
drop constraint if exists message_notification_claims_email_attempt_count_check;

alter table public.message_notification_claims
add constraint message_notification_claims_email_attempt_count_check
check (email_attempt_count >= 0);

create index if not exists message_notification_delivery_retry_idx
on public.message_notification_claims (
  email_sent_at,
  email_claim_expires_at,
  claimed_at
)
where email_sent_at is null;

alter table public.profile_favorite_notification_claims
add column if not exists sent_at timestamptz,
add column if not exists claim_token uuid,
add column if not exists claim_expires_at timestamptz,
add column if not exists delivery_id uuid,
add column if not exists attempt_count integer not null default 0,
add column if not exists last_attempt_at timestamptz;

-- Existing favorite claims already represented completed notifications.
update public.profile_favorite_notification_claims
set sent_at = claimed_at
where sent_at is null;

update public.profile_favorite_notification_claims
set delivery_id = gen_random_uuid()
where delivery_id is null;

alter table public.profile_favorite_notification_claims
alter column delivery_id set default gen_random_uuid(),
alter column delivery_id set not null;

alter table public.profile_favorite_notification_claims
drop constraint if exists profile_favorite_notification_attempt_count_check;

alter table public.profile_favorite_notification_claims
add constraint profile_favorite_notification_attempt_count_check
check (attempt_count >= 0);

create index if not exists profile_favorite_notification_delivery_retry_idx
on public.profile_favorite_notification_claims (
  sent_at,
  claim_expires_at,
  claimed_at
);

-- The legacy browser-callable claim functions consumed notifications before
-- the provider result was known. Delivery claims are now server-only.
revoke all on function public.claim_new_message_notification(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.claim_profile_favorite_notification(uuid)
from public, anon, authenticated, service_role;

create or replace function public.claim_new_message_notification_delivery(
  p_conversation_id uuid,
  p_message_id uuid,
  p_sender_id uuid
)
returns table (
  claim_token uuid,
  delivery_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_conversation_id is null or p_message_id is null or p_sender_id is null then
    raise exception 'Invalid notification claim';
  end if;

  if not exists (
    select 1
    from public.messages message
    where message.id = p_message_id
      and message.conversation_id = p_conversation_id
      and message.sender_id = p_sender_id
  ) then
    raise exception 'Message not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'message-notification-delivery:' ||
      p_conversation_id::text || ':' || p_sender_id::text,
      0
    )
  );

  return query
  update public.message_notification_claims notification_claim
  set
    email_claimed_at = v_now,
    email_claim_token = gen_random_uuid(),
    email_claim_expires_at = v_now + interval '10 minutes',
    email_attempt_count = notification_claim.email_attempt_count + 1,
    email_last_attempt_at = v_now
  where notification_claim.conversation_id = p_conversation_id
    and notification_claim.sender_id = p_sender_id
    and notification_claim.email_sent_at is null
    and (
      notification_claim.email_claim_token is null
      or notification_claim.email_claim_expires_at is null
      or notification_claim.email_claim_expires_at <= v_now
    )
  returning
    notification_claim.email_claim_token,
    notification_claim.email_delivery_id;
end;
$$;

create or replace function public.complete_new_message_notification_delivery(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_claim_token uuid,
  p_completed_at timestamptz default pg_catalog.clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.message_notification_claims
  set
    email_sent_at = p_completed_at,
    email_claim_token = null,
    email_claim_expires_at = null
  where conversation_id = p_conversation_id
    and sender_id = p_sender_id
    and email_sent_at is null
    and email_claim_token = p_claim_token
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create or replace function public.release_new_message_notification_delivery(
  p_conversation_id uuid,
  p_sender_id uuid,
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

  update public.message_notification_claims
  set
    email_claim_token = null,
    email_claim_expires_at = null
  where conversation_id = p_conversation_id
    and sender_id = p_sender_id
    and email_sent_at is null
    and email_claim_token = p_claim_token
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

create or replace function public.claim_profile_favorite_notification_delivery(
  p_actor_id uuid,
  p_recipient_id uuid
)
returns table (
  claim_token uuid,
  delivery_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.profile_favorite_notification_claims%rowtype;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profile_favorites favorite
    where favorite.user_id = p_actor_id
      and favorite.profile_id = p_recipient_id
  ) or not public.profile_favorite_pair_allowed(p_actor_id, p_recipient_id) then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-favorite-notification-delivery:' ||
      p_actor_id::text || ':' || p_recipient_id::text,
      0
    )
  );

  select notification_claim.*
  into v_existing
  from public.profile_favorite_notification_claims notification_claim
  where notification_claim.actor_id = p_actor_id
    and notification_claim.recipient_id = p_recipient_id;

  if found
    and v_existing.sent_at is not null
    and v_existing.sent_at > v_now - interval '7 days'
  then
    return;
  end if;

  if found
    and v_existing.sent_at is null
    and v_existing.claim_token is not null
    and v_existing.claim_expires_at > v_now
  then
    return;
  end if;

  return query
  insert into public.profile_favorite_notification_claims (
    actor_id,
    recipient_id,
    claimed_at,
    sent_at,
    claim_token,
    claim_expires_at,
    delivery_id,
    attempt_count,
    last_attempt_at
  )
  values (
    p_actor_id,
    p_recipient_id,
    v_now,
    null,
    gen_random_uuid(),
    v_now + interval '10 minutes',
    gen_random_uuid(),
    1,
    v_now
  )
  on conflict (actor_id, recipient_id) do update
  set
    claimed_at = case
      when profile_favorite_notification_claims.sent_at is not null
        then excluded.claimed_at
      else profile_favorite_notification_claims.claimed_at
    end,
    sent_at = null,
    claim_token = excluded.claim_token,
    claim_expires_at = excluded.claim_expires_at,
    delivery_id = case
      when profile_favorite_notification_claims.sent_at is not null
        then excluded.delivery_id
      else profile_favorite_notification_claims.delivery_id
    end,
    attempt_count = case
      when profile_favorite_notification_claims.sent_at is not null
        then 1
      else profile_favorite_notification_claims.attempt_count + 1
    end,
    last_attempt_at = excluded.last_attempt_at
  returning
    profile_favorite_notification_claims.claim_token,
    profile_favorite_notification_claims.delivery_id;

  return;
end;
$$;

create or replace function public.complete_profile_favorite_notification_delivery(
  p_actor_id uuid,
  p_recipient_id uuid,
  p_claim_token uuid,
  p_completed_at timestamptz default pg_catalog.clock_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.profile_favorite_notification_claims
  set
    sent_at = p_completed_at,
    claim_token = null,
    claim_expires_at = null
  where actor_id = p_actor_id
    and recipient_id = p_recipient_id
    and sent_at is null
    and claim_token = p_claim_token
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create or replace function public.release_profile_favorite_notification_delivery(
  p_actor_id uuid,
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

  update public.profile_favorite_notification_claims
  set
    claim_token = null,
    claim_expires_at = null
  where actor_id = p_actor_id
    and recipient_id = p_recipient_id
    and sent_at is null
    and claim_token = p_claim_token
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_new_message_notification_delivery(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_new_message_notification_delivery(uuid, uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.release_new_message_notification_delivery(uuid, uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.claim_profile_favorite_notification_delivery(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_profile_favorite_notification_delivery(uuid, uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.release_profile_favorite_notification_delivery(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.claim_new_message_notification_delivery(uuid, uuid, uuid)
to service_role;
grant execute on function public.complete_new_message_notification_delivery(uuid, uuid, uuid, timestamptz)
to service_role;
grant execute on function public.release_new_message_notification_delivery(uuid, uuid, uuid)
to service_role;
grant execute on function public.claim_profile_favorite_notification_delivery(uuid, uuid)
to service_role;
grant execute on function public.complete_profile_favorite_notification_delivery(uuid, uuid, uuid, timestamptz)
to service_role;
grant execute on function public.release_profile_favorite_notification_delivery(uuid, uuid, uuid)
to service_role;
