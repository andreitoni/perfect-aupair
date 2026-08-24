-- Restore the calm message-email cadence after the temporary
-- high-frequency experiment: at most one email per recipient-local day, at
-- least twelve hours between deliveries, and one 08:00 local digest for
-- messages received during 21:00-08:00 quiet hours.

update public.feature_flags
set description =
  'Allow at most one message email per recipient-local day, at least 12 hours apart, with quiet-hours messages grouped for 08:00 local time.'
where key = 'engagement_emails';

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
  v_recipient_today date;
  v_timezone text;
  v_delivery_id uuid;
  v_global_count integer;
  v_category_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_recipient_id is null or p_category <> 'new_message' then
    return null;
  end if;

  if not coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = 'engagement_emails'
  ), false) then
    return null;
  end if;

  select public.message_notification_timezone(profile.country)
  into v_timezone
  from public.profiles profile
  where profile.id = p_recipient_id
    and profile.onboarding_completed is true
    and profile.suspended_at is null
    and profile.deletion_requested_at is null
    and profile.is_admin is not true
    and profile.new_message_emails_enabled is true;

  if v_timezone is null then
    return null;
  end if;

  v_recipient_today := (v_now at time zone v_timezone)::date;

  -- Every reservation takes the global lock first, then the recipient lock.
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

  if exists (
    select 1
    from public.engagement_email_delivery_reservations reservation
    where reservation.recipient_id = p_recipient_id
      and reservation.category = p_category
      and reservation.released_at is null
      and (
        coalesce(reservation.sent_at, reservation.reserved_at) >
          v_now - interval '12 hours'
        or (
          coalesce(reservation.sent_at, reservation.reserved_at)
            at time zone v_timezone
        )::date = v_recipient_today
      )
  ) then
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

revoke all on function public.reserve_engagement_email_delivery(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_engagement_email_delivery(uuid, text)
to service_role;

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
  v_last_delivery_at timestamptz;
  v_timezone text;
  v_local_now timestamp;
  v_last_delivery_local_date date;
  v_digest_date date;
  v_due_at timestamptz;
  v_quiet_hours boolean;
  v_queued boolean;
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
  v_quiet_hours := extract(hour from v_local_now) >= 21
    or extract(hour from v_local_now) < 8;

  select max(coalesce(reservation.sent_at, reservation.reserved_at))
  into v_last_delivery_at
  from public.engagement_email_delivery_reservations reservation
  where reservation.recipient_id = p_recipient_id
    and reservation.category = 'new_message'
    and reservation.released_at is null;

  if v_last_delivery_at is not null then
    v_last_delivery_local_date :=
      (v_last_delivery_at at time zone v_timezone)::date;
  end if;

  if not v_quiet_hours
    and (
      v_last_delivery_at is null
      or (
        v_last_delivery_at <= v_now - interval '12 hours'
        and v_last_delivery_local_date < v_local_now::date
      )
    )
  then
    return 'immediate';
  end if;

  if v_quiet_hours then
    if extract(hour from v_local_now) >= 21 then
      v_digest_date := v_local_now::date + 1;
    else
      v_digest_date := v_local_now::date;
    end if;
  elsif v_last_delivery_local_date = v_local_now::date then
    v_digest_date := v_local_now::date + 1;
  else
    v_digest_date := v_local_now::date;
  end if;

  v_due_at := (v_digest_date::timestamp + time '08:00')
    at time zone v_timezone;

  if v_last_delivery_at is not null then
    v_due_at := greatest(v_due_at, v_last_delivery_at + interval '12 hours');
    v_digest_date := (v_due_at at time zone v_timezone)::date;
  end if;

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
    due_at = greatest(
      public.message_digest_email_deliveries.due_at,
      excluded.due_at
    ),
    first_message_at = least(
      public.message_digest_email_deliveries.first_message_at,
      excluded.first_message_at
    ),
    latest_message_at = greatest(
      public.message_digest_email_deliveries.latest_message_at,
      excluded.latest_message_at
    ),
    updated_at = v_now
  where public.message_digest_email_deliveries.sent_at is null
    and public.message_digest_email_deliveries.suppressed_at is null
  returning true into v_queued;

  return case when coalesce(v_queued, false)
    then 'queued_digest'
    else 'suppressed_cadence'
  end;
end;
$$;

revoke all on function public.schedule_message_notification_delivery(uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.schedule_message_notification_delivery(uuid, uuid, timestamptz)
to service_role;
