-- Send one lifecycle reminder 48 hours after account creation when onboarding
-- is complete but the profile still has no photo. Claims are server-only and
-- provider idempotency uses delivery_id so retries cannot duplicate delivery.

insert into public.feature_flags (key, enabled, description)
values (
  'profile_completion_reminders',
  true,
  'Send one profile-photo completion reminder after 48 hours.'
)
on conflict (key) do nothing;

create table if not exists public.profile_completion_reminder_deliveries (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  delivery_id uuid not null default gen_random_uuid() unique,
  claim_token uuid,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  suppressed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint profile_completion_reminder_terminal_state_check
    check (not (sent_at is not null and suppressed_at is not null))
);

alter table public.profile_completion_reminder_deliveries enable row level security;

revoke all on table public.profile_completion_reminder_deliveries
from public, anon, authenticated;
grant select, insert, update, delete
on table public.profile_completion_reminder_deliveries to service_role;

create index if not exists profile_completion_reminder_retry_idx
on public.profile_completion_reminder_deliveries (
  claim_expires_at,
  created_at,
  profile_id
)
where sent_at is null and suppressed_at is null;

create or replace function public.claim_profile_completion_reminders(
  p_batch_size integer default 25,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  profile_id uuid,
  account_type text,
  first_name text,
  full_name text,
  claim_token uuid,
  delivery_id uuid
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

  if not coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = 'profile_completion_reminders'
  ), false) then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('profile-completion-reminder-claim', 0)
  );

  insert into public.profile_completion_reminder_deliveries (profile_id)
  select profile.id
  from public.profiles profile
  where profile.account_type in ('au_pair', 'family')
    and profile.onboarding_completed is true
    and profile.notification_emails_enabled is true
    and profile.is_admin is not true
    and profile.suspended_at is null
    and profile.deletion_requested_at is null
    and profile.created_at <= v_now - interval '48 hours'
    and profile.email is not null
    and pg_catalog.btrim(profile.email) <> ''
    and not exists (
      select 1
      from public.profile_photos photo
      where photo.profile_id = profile.id
    )
  order by profile.created_at asc, profile.id asc
  limit v_batch_size
  on conflict on constraint profile_completion_reminder_deliveries_pkey
  do nothing;

  return query
  with claimable as (
    select delivery.profile_id
    from public.profile_completion_reminder_deliveries delivery
    join public.profiles profile on profile.id = delivery.profile_id
    where delivery.sent_at is null
      and delivery.suppressed_at is null
      and (
        delivery.claim_token is null
        or delivery.claim_expires_at is null
        or delivery.claim_expires_at <= v_now
      )
      and profile.account_type in ('au_pair', 'family')
      and profile.onboarding_completed is true
      and profile.notification_emails_enabled is true
      and profile.is_admin is not true
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.created_at <= v_now - interval '48 hours'
      and not exists (
        select 1
        from public.profile_photos photo
        where photo.profile_id = profile.id
      )
    order by profile.created_at asc, profile.id asc
    limit v_batch_size
    for update of delivery skip locked
  ), claimed as (
    update public.profile_completion_reminder_deliveries delivery
    set
      claim_token = gen_random_uuid(),
      claim_expires_at = v_now + interval '15 minutes',
      attempt_count = delivery.attempt_count + 1,
      last_attempt_at = v_now
    from claimable
    where delivery.profile_id = claimable.profile_id
    returning
      delivery.profile_id,
      delivery.claim_token,
      delivery.delivery_id
  )
  select
    claimed.profile_id,
    profile.account_type,
    profile.first_name,
    profile.full_name,
    claimed.claim_token,
    claimed.delivery_id
  from claimed
  join public.profiles profile on profile.id = claimed.profile_id
  order by profile.created_at asc, profile.id asc;
end;
$$;

create or replace function public.complete_profile_completion_reminder(
  p_profile_id uuid,
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
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_outcome not in ('sent', 'suppressed') then
    return false;
  end if;

  update public.profile_completion_reminder_deliveries
  set
    sent_at = case when p_outcome = 'sent' then p_completed_at else null end,
    suppressed_at = case
      when p_outcome = 'suppressed' then p_completed_at
      else null
    end,
    claim_token = null,
    claim_expires_at = null
  where profile_id = p_profile_id
    and claim_token = p_claim_token
    and sent_at is null
    and suppressed_at is null
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create or replace function public.release_profile_completion_reminder(
  p_profile_id uuid,
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

  update public.profile_completion_reminder_deliveries
  set
    claim_token = null,
    claim_expires_at = null
  where profile_id = p_profile_id
    and claim_token = p_claim_token
    and sent_at is null
    and suppressed_at is null
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_profile_completion_reminders(integer, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.claim_profile_completion_reminders(integer, timestamptz)
to service_role;

revoke all on function public.complete_profile_completion_reminder(uuid, uuid, text, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.complete_profile_completion_reminder(uuid, uuid, text, timestamptz)
to service_role;

revoke all on function public.release_profile_completion_reminder(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.release_profile_completion_reminder(uuid, uuid)
to service_role;
