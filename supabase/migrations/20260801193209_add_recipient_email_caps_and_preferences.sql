-- Keep optional member emails useful without allowing a popular profile to
-- receive an unbounded number of notifications. Essential auth, safety, and
-- account lifecycle emails intentionally do not use this budget.

alter table public.profiles
add column if not exists new_message_emails_enabled boolean,
add column if not exists profile_completion_emails_enabled boolean,
add column if not exists email_unsubscribe_token uuid;

update public.profiles
set
  new_message_emails_enabled = coalesce(
    new_message_emails_enabled,
    notification_emails_enabled,
    true
  ),
  profile_completion_emails_enabled = coalesce(
    profile_completion_emails_enabled,
    notification_emails_enabled,
    true
  ),
  email_unsubscribe_token = coalesce(email_unsubscribe_token, gen_random_uuid());

alter table public.profiles
alter column new_message_emails_enabled set default true,
alter column new_message_emails_enabled set not null,
alter column profile_completion_emails_enabled set default true,
alter column profile_completion_emails_enabled set not null,
alter column email_unsubscribe_token set default gen_random_uuid(),
alter column email_unsubscribe_token set not null;

create unique index if not exists profiles_email_unsubscribe_token_key
on public.profiles (email_unsubscribe_token);

comment on column public.profiles.new_message_emails_enabled is
  'Whether the member wants the bounded first-message email notification.';
comment on column public.profiles.profile_completion_emails_enabled is
  'Whether the member wants the one-time profile completion reminder.';
comment on column public.profiles.email_unsubscribe_token is
  'Opaque bearer token used only by same-origin optional-email unsubscribe routes.';

update public.feature_flags
set description =
  'Allow at most two first-message emails per recipient in a rolling 24-hour window.'
where key = 'engagement_emails';

comment on column public.profiles.notification_emails_enabled is
  'Legacy aggregate switch kept in sync with new-message and profile-completion email preferences.';

revoke all on function public.reserve_engagement_email_budget(text, integer)
from public, anon, authenticated, service_role;

create table public.engagement_email_delivery_reservations (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category = 'new_message'),
  reserved_at timestamptz not null default pg_catalog.clock_timestamp(),
  sent_at timestamptz,
  released_at timestamptz,
  constraint engagement_email_delivery_reservation_state_check
    check (not (sent_at is not null and released_at is not null))
);

create index engagement_email_delivery_recipient_window_idx
on public.engagement_email_delivery_reservations (
  recipient_id,
  reserved_at desc
)
where released_at is null;

create index engagement_email_delivery_global_window_idx
on public.engagement_email_delivery_reservations (
  reserved_at desc,
  category
)
where released_at is null;

alter table public.engagement_email_delivery_reservations enable row level security;
revoke all on table public.engagement_email_delivery_reservations
from public, anon, authenticated;
grant select, insert, update, delete
on table public.engagement_email_delivery_reservations to service_role;

create or replace function public.reserve_engagement_email_delivery(
  p_recipient_id uuid,
  p_category text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_today date := (v_now at time zone 'UTC')::date;
  v_delivery_id uuid;
  v_global_count integer;
  v_category_count integer;
  v_recipient_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_recipient_id is null
    or p_category <> 'new_message'
  then
    return null;
  end if;

  if not coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = 'engagement_emails'
  ), false) then
    return null;
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_recipient_id
      and profile.onboarding_completed is true
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.is_admin is not true
      and profile.new_message_emails_enabled is true
  ) then
    return null;
  end if;

  -- Every reservation takes the global lock first, then the recipient lock.
  -- This stable order avoids deadlocks while keeping both limits atomic.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'engagement-email-delivery-global:' || v_today::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'engagement-email-delivery-recipient:' || p_recipient_id::text,
      0
    )
  );

  delete from public.engagement_email_delivery_reservations reservation
  where coalesce(
    reservation.sent_at,
    reservation.released_at,
    reservation.reserved_at
  ) < v_now - interval '31 days';

  select pg_catalog.count(*)::integer
  into v_recipient_count
  from public.engagement_email_delivery_reservations reservation
  where reservation.recipient_id = p_recipient_id
    and reservation.released_at is null
    and reservation.reserved_at > v_now - interval '24 hours';

  if v_recipient_count >= 2 then
    return null;
  end if;

  select pg_catalog.count(*)::integer
  into v_global_count
  from public.engagement_email_delivery_reservations reservation
  where reservation.released_at is null
    and (reservation.reserved_at at time zone 'UTC')::date = v_today;

  if v_global_count >= 500 then
    return null;
  end if;

  select pg_catalog.count(*)::integer
  into v_category_count
  from public.engagement_email_delivery_reservations reservation
  where reservation.released_at is null
    and reservation.category = p_category
    and (reservation.reserved_at at time zone 'UTC')::date = v_today;

  if v_category_count >= 500 then
    return null;
  end if;

  insert into public.engagement_email_delivery_reservations (
    recipient_id,
    category,
    reserved_at
  ) values (
    p_recipient_id,
    p_category,
    v_now
  )
  returning id into v_delivery_id;

  return v_delivery_id;
end;
$$;

create or replace function public.complete_engagement_email_delivery(
  p_delivery_id uuid,
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

  update public.engagement_email_delivery_reservations
  set sent_at = coalesce(p_completed_at, pg_catalog.clock_timestamp())
  where id = p_delivery_id
    and sent_at is null
    and released_at is null
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create or replace function public.release_engagement_email_delivery(
  p_delivery_id uuid
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

  update public.engagement_email_delivery_reservations
  set released_at = pg_catalog.clock_timestamp()
  where id = p_delivery_id
    and sent_at is null
    and released_at is null
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.reserve_engagement_email_delivery(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.complete_engagement_email_delivery(uuid, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.release_engagement_email_delivery(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_engagement_email_delivery(uuid, text)
to service_role;
grant execute on function public.complete_engagement_email_delivery(uuid, timestamptz)
to service_role;
grant execute on function public.release_engagement_email_delivery(uuid)
to service_role;

-- Individual favorite-email delivery is retired completely. Favorites remain
-- visible only through the in-app notification surfaces.
revoke all on function public.claim_profile_favorite_notification_delivery(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_profile_favorite_notification_delivery(uuid, uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.release_profile_favorite_notification_delivery(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

-- The lifecycle reminder keeps its one-delivery guarantee but now observes its
-- own preference instead of the former combined notification switch.
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
    and profile.profile_completion_emails_enabled is true
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
  order by profile.created_at, profile.id
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
      and profile.profile_completion_emails_enabled is true
      and profile.is_admin is not true
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.created_at <= v_now - interval '24 hours'
      and not exists (
        select 1
        from public.profile_photos photo
        where photo.profile_id = profile.id
      )
    order by profile.created_at, profile.id
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
  order by profile.created_at, profile.id;
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
      and profile.profile_completion_emails_enabled is true
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

revoke all on function public.claim_profile_completion_reminders(integer, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.claim_profile_completion_reminder_now(uuid, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.claim_profile_completion_reminders(integer, timestamptz)
to service_role;
grant execute on function public.claim_profile_completion_reminder_now(uuid, timestamptz)
to service_role;

create or replace function public.unsubscribe_optional_profile_email(
  p_token uuid,
  p_category text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_token is null
    or p_category not in ('new_message', 'profile_completion')
  then
    return false;
  end if;

  update public.profiles profile
  set
    new_message_emails_enabled = case
      when p_category = 'new_message' then false
      else profile.new_message_emails_enabled
    end,
    profile_completion_emails_enabled = case
      when p_category = 'profile_completion' then false
      else profile.profile_completion_emails_enabled
    end,
    notification_emails_enabled = (
      case
        when p_category = 'new_message' then false
        else profile.new_message_emails_enabled
      end
      or case
        when p_category = 'profile_completion' then false
        else profile.profile_completion_emails_enabled
      end
    )
  where profile.email_unsubscribe_token = p_token
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke all on function public.unsubscribe_optional_profile_email(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.unsubscribe_optional_profile_email(uuid, text)
to service_role;
