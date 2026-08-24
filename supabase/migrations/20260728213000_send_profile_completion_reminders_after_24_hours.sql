-- Lower the recurring profile completion reminder threshold from 48 to 24
-- hours. A separate service-role-only function permits a deliberate immediate
-- send while preserving every other eligibility and deduplication guard.

update public.feature_flags
set description = 'Send one profile-photo completion reminder after 24 hours.'
where key = 'profile_completion_reminders';

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
    and profile.created_at <= v_now - interval '24 hours'
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
      and profile.created_at <= v_now - interval '24 hours'
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

create or replace function public.claim_profile_completion_reminder_now(
  p_profile_id uuid,
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
  v_now timestamptz := coalesce(p_now, pg_catalog.clock_timestamp());
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_profile_id is null or not coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = 'profile_completion_reminders'
  ), false) then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-completion-reminder-now:' || p_profile_id::text,
      0
    )
  );

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.account_type in ('au_pair', 'family')
      and profile.onboarding_completed is true
      and profile.notification_emails_enabled is true
      and profile.is_admin is not true
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.email is not null
      and pg_catalog.btrim(profile.email) <> ''
      and not exists (
        select 1
        from public.profile_photos photo
        where photo.profile_id = profile.id
      )
  ) then
    return;
  end if;

  insert into public.profile_completion_reminder_deliveries (profile_id)
  values (p_profile_id)
  on conflict on constraint profile_completion_reminder_deliveries_pkey
  do nothing;

  return query
  with claimed as (
    update public.profile_completion_reminder_deliveries delivery
    set
      claim_token = gen_random_uuid(),
      claim_expires_at = v_now + interval '15 minutes',
      attempt_count = delivery.attempt_count + 1,
      last_attempt_at = v_now
    where delivery.profile_id = p_profile_id
      and delivery.sent_at is null
      and delivery.suppressed_at is null
      and (
        delivery.claim_token is null
        or delivery.claim_expires_at is null
        or delivery.claim_expires_at <= v_now
      )
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
  join public.profiles profile on profile.id = claimed.profile_id;
end;
$$;

revoke all on function public.claim_profile_completion_reminder_now(uuid, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.claim_profile_completion_reminder_now(uuid, timestamptz)
to service_role;
