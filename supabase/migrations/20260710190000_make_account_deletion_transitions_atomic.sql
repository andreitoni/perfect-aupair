alter table public.account_deletion_requests
add column if not exists confirmation_email_sent_at timestamptz,
add column if not exists processing_started_at timestamptz;

alter table public.account_deletion_requests
drop constraint if exists account_deletion_requests_status_check;

alter table public.account_deletion_requests
add constraint account_deletion_requests_status_check
check (status in ('pending', 'processing', 'completed', 'cancelled'));

-- Treat pre-migration requests as already notified so the rollout cannot send
-- duplicate confirmation emails to accounts that are already in the grace period.
update public.account_deletion_requests
set confirmation_email_sent_at = requested_at
where confirmation_email_sent_at is null;

-- The former two-step cancellation flow could clear the profile marker before
-- cancelling its queue row. Such rows must never remain eligible for cleanup.
update public.account_deletion_requests deletion_request
set status = 'cancelled'
where deletion_request.status = 'pending'
  and exists (
    select 1
    from public.profiles profile
    where profile.id = deletion_request.profile_id
      and profile.deletion_requested_at is null
  );

-- Keep only the newest active request if legacy retries created duplicates.
with ranked_active_requests as (
  select
    id,
    row_number() over (
      partition by profile_id
      order by requested_at desc, created_at desc, id desc
    ) as request_rank
  from public.account_deletion_requests
  where status in ('pending', 'processing')
)
update public.account_deletion_requests deletion_request
set
  status = 'cancelled',
  processing_started_at = null
from ranked_active_requests ranked_request
where deletion_request.id = ranked_request.id
  and ranked_request.request_rank > 1;

-- Synchronize retained legacy requests with the marker used by access guards.
with active_request as (
  select distinct on (profile_id)
    profile_id,
    requested_at,
    scheduled_delete_at
  from public.account_deletion_requests
  where status in ('pending', 'processing')
  order by profile_id, requested_at desc, created_at desc, id desc
)
update public.profiles profile
set
  deletion_requested_at = active_request.requested_at,
  deletion_scheduled_at = active_request.scheduled_delete_at
from active_request
where profile.id = active_request.profile_id;

create unique index if not exists account_deletion_requests_one_active_per_profile_idx
on public.account_deletion_requests (profile_id)
where status in ('pending', 'processing');

drop function if exists public.request_account_deletion();
drop function if exists public.cancel_account_deletion();

create function public.request_account_deletion(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_email text;
  v_current_public_slug text;
  v_current_is_admin boolean;
  v_requested_at timestamptz := now();
  v_scheduled_delete_at timestamptz := v_requested_at + interval '7 days';
  v_request_id uuid;
  v_existing_requested_at timestamptz;
  v_existing_scheduled_delete_at timestamptz;
  v_should_send_confirmation_email boolean;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'Profile id is required' using errcode = '22004';
  end if;

  select
    profile.email,
    profile.public_slug,
    coalesce(profile.is_admin, false)
  into
    v_current_email,
    v_current_public_slug,
    v_current_is_admin
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_current_is_admin then
    raise exception 'Admin accounts cannot be deleted from the account page'
      using errcode = '42501';
  end if;

  select
    deletion_request.id,
    deletion_request.requested_at,
    deletion_request.scheduled_delete_at
  into
    v_request_id,
    v_existing_requested_at,
    v_existing_scheduled_delete_at
  from public.account_deletion_requests deletion_request
  where deletion_request.profile_id = p_profile_id
    and deletion_request.status in ('pending', 'processing')
  order by deletion_request.requested_at desc, deletion_request.created_at desc
  limit 1
  for update;

  select not exists (
    select 1
    from public.account_deletion_requests deletion_request
    where deletion_request.profile_id = p_profile_id
      and deletion_request.confirmation_email_sent_at >=
        v_requested_at - interval '7 days'
  )
  into v_should_send_confirmation_email;

  if v_request_id is not null then
    update public.profiles
    set
      deletion_requested_at = v_existing_requested_at,
      deletion_scheduled_at = v_existing_scheduled_delete_at
    where id = p_profile_id;

    return jsonb_build_object(
      'request_id', v_request_id,
      'public_slug', v_current_public_slug,
      'should_send_confirmation_email', v_should_send_confirmation_email
    );
  end if;

  update public.profiles
  set
    deletion_requested_at = v_requested_at,
    deletion_scheduled_at = v_scheduled_delete_at
  where id = p_profile_id;

  insert into public.account_deletion_requests (
    profile_id,
    email,
    requested_at,
    scheduled_delete_at
  )
  values (
    p_profile_id,
    v_current_email,
    v_requested_at,
    v_scheduled_delete_at
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'public_slug', v_current_public_slug,
    'should_send_confirmation_email', v_should_send_confirmation_email
  );
end;
$$;

create function public.cancel_account_deletion(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_public_slug text;
  v_current_is_admin boolean;
  v_deletion_requested_at timestamptz;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'Profile id is required' using errcode = '22004';
  end if;

  select
    profile.public_slug,
    coalesce(profile.is_admin, false),
    profile.deletion_requested_at
  into
    v_current_public_slug,
    v_current_is_admin,
    v_deletion_requested_at
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_current_is_admin then
    raise exception 'Admin accounts cannot be reactivated from the account page'
      using errcode = '42501';
  end if;

  if v_deletion_requested_at is null or not exists (
    select 1
    from public.account_deletion_requests deletion_request
    where deletion_request.profile_id = p_profile_id
      and deletion_request.status = 'pending'
  ) then
    raise exception 'No pending account deletion request' using errcode = 'P0002';
  end if;

  update public.profiles
  set
    deletion_requested_at = null,
    deletion_scheduled_at = null
  where id = p_profile_id;

  update public.account_deletion_requests
  set status = 'cancelled'
  where profile_id = p_profile_id
    and status = 'pending';

  return jsonb_build_object('public_slug', v_current_public_slug);
end;
$$;

create function public.claim_scheduled_account_deletion(
  p_request_id uuid,
  p_cutoff timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.account_deletion_requests deletion_request
  set
    status = 'processing',
    processing_started_at = now()
  where deletion_request.id = p_request_id
    and deletion_request.status = 'pending'
    and deletion_request.scheduled_delete_at <= p_cutoff
    and (
      not exists (
        select 1
        from public.profiles profile
        where profile.id = deletion_request.profile_id
      )
      or exists (
        select 1
        from public.profiles profile
        where profile.id = deletion_request.profile_id
          and profile.deletion_requested_at is not null
          and profile.deletion_scheduled_at = deletion_request.scheduled_delete_at
          and profile.deletion_scheduled_at <= p_cutoff
      )
    )
  returning deletion_request.profile_id into v_profile_id;

  return v_profile_id;
end;
$$;

create function public.release_account_deletion_claim(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set
    status = 'pending',
    processing_started_at = null
  where id = p_request_id
    and status = 'processing';
end;
$$;

revoke all on function public.request_account_deletion(uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_account_deletion(uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_scheduled_account_deletion(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.release_account_deletion_claim(uuid) from public, anon, authenticated, service_role;

grant execute on function public.request_account_deletion(uuid) to service_role;
grant execute on function public.cancel_account_deletion(uuid) to service_role;
grant execute on function public.claim_scheduled_account_deletion(uuid, timestamptz) to service_role;
grant execute on function public.release_account_deletion_claim(uuid) to service_role;
