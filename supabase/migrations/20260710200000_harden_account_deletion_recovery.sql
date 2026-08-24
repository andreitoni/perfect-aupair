alter table public.account_deletion_requests
add column if not exists confirmation_email_sending_at timestamptz,
add column if not exists processing_token uuid,
add column if not exists destructive_started_at timestamptz,
add column if not exists cleanup_storage_manifest jsonb;

-- Keep every existing admin account out of the deletion worker, including
-- legacy requests that were already claimed before this hardening migration.
update public.account_deletion_requests deletion_request
set
  status = 'cancelled',
  processing_started_at = null,
  processing_token = null,
  confirmation_email_sending_at = null
where deletion_request.status in ('pending', 'processing')
  and exists (
    select 1
    from public.profiles profile
    where profile.id = deletion_request.profile_id
      and coalesce(profile.is_admin, false)
  );

update public.profiles
set
  deletion_requested_at = null,
  deletion_scheduled_at = null
where coalesce(is_admin, false)
  and deletion_requested_at is not null;

-- Repair the inverse legacy partial-write state: the profile was hidden, but
-- the queue insert failed. Recreate a pending request so the user can either
-- reactivate or be cleaned up after the documented grace period.
update public.profiles profile
set deletion_scheduled_at = coalesce(
  profile.deletion_scheduled_at,
  profile.deletion_requested_at + interval '7 days'
)
where profile.deletion_requested_at is not null
  and profile.deletion_scheduled_at is null;

insert into public.account_deletion_requests (
  profile_id,
  email,
  requested_at,
  scheduled_delete_at
)
select
  profile.id,
  coalesce(auth_user.email, profile.email),
  profile.deletion_requested_at,
  profile.deletion_scheduled_at
from public.profiles profile
left join auth.users auth_user on auth_user.id = profile.id
where profile.deletion_requested_at is not null
  and profile.deletion_scheduled_at is not null
  and not coalesce(profile.is_admin, false)
  and not exists (
    select 1
    from public.account_deletion_requests deletion_request
    where deletion_request.profile_id = profile.id
      and deletion_request.status in ('pending', 'processing')
  );

drop function if exists public.request_account_deletion(uuid);
drop function if exists public.claim_scheduled_account_deletion(uuid, timestamptz);
drop function if exists public.claim_scheduled_account_deletion(uuid, timestamptz, timestamptz);
drop function if exists public.release_account_deletion_claim(uuid);

create function public.request_account_deletion(
  p_profile_id uuid,
  p_email text
)
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_id::text, 0)
  );

  select
    coalesce(nullif(pg_catalog.btrim(p_email), ''), profile.email),
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
    update public.account_deletion_requests
    set email = v_current_email
    where id = v_request_id;

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

create or replace function public.cancel_account_deletion(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_public_slug text;
  v_current_is_admin boolean;
  v_deletion_requested_at timestamptz;
  v_cancelled_request_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'Profile id is required' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_id::text, 0)
  );

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

  if v_deletion_requested_at is null then
    raise exception 'No pending account deletion request' using errcode = 'P0002';
  end if;

  update public.account_deletion_requests
  set
    status = 'cancelled',
    processing_started_at = null,
    processing_token = null,
    destructive_started_at = null,
    cleanup_storage_manifest = null,
    confirmation_email_sending_at = null
  where profile_id = p_profile_id
    and status = 'pending'
  returning id into v_cancelled_request_id;

  if v_cancelled_request_id is null then
    raise exception 'Account deletion is already being processed'
      using errcode = '55000';
  end if;

  update public.profiles
  set
    deletion_requested_at = null,
    deletion_scheduled_at = null
  where id = p_profile_id;

  return jsonb_build_object('public_slug', v_current_public_slug);
end;
$$;

create or replace function public.guard_profile_admin_promotion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_status text;
  v_destructive_started_at timestamptz;
begin
  if
    new.is_admin is distinct from old.is_admin
    and coalesce((select auth.role()), '') <> 'service_role'
  then
    raise exception 'Admin status can only be changed by the service role'
      using errcode = '42501';
  end if;

  if not coalesce(old.is_admin, false) and coalesce(new.is_admin, false) then
    select
      deletion_request.status,
      deletion_request.destructive_started_at
    into
      v_active_status,
      v_destructive_started_at
    from public.account_deletion_requests deletion_request
    where deletion_request.profile_id = new.id
      and deletion_request.status in ('pending', 'processing')
    order by deletion_request.requested_at desc, deletion_request.created_at desc
    limit 1
    for update;

    if
      v_active_status = 'processing'
      and v_destructive_started_at is not null
    then
      raise exception 'Account deletion has already started; admin promotion is blocked'
        using errcode = '55000';
    end if;

    update public.account_deletion_requests
    set
      status = 'cancelled',
      processing_started_at = null,
      processing_token = null,
      destructive_started_at = null,
      cleanup_storage_manifest = null,
      confirmation_email_sending_at = null
    where profile_id = new.id
      and (
        status = 'pending'
        or (status = 'processing' and destructive_started_at is null)
      );

    new.deletion_requested_at := null;
    new.deletion_scheduled_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_admin_promotion_trigger on public.profiles;

create trigger guard_profile_admin_promotion_trigger
before update of is_admin on public.profiles
for each row
execute function public.guard_profile_admin_promotion();

-- The photo audit trigger records normal photo deletions against profiles.
-- During an auth-user cascade PostgreSQL can otherwise remove the profile
-- before the profile_photos AFTER DELETE audit runs, violating the audit FK and
-- aborting the entire account deletion. Delete photo rows while the parent is
-- still present; their transient audit rows then cascade with the profile.
create or replace function public.delete_profile_photos_before_profile_cascade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profile_photos
  where profile_id = old.id;

  return old;
end;
$$;

drop trigger if exists delete_profile_photos_before_profile_cascade_trigger
on public.profiles;

create trigger delete_profile_photos_before_profile_cascade_trigger
before delete on public.profiles
for each row
execute function public.delete_profile_photos_before_profile_cascade();

-- Once either participant has requested deletion the account is inactive.
-- Block new messages at the database boundary so a cleanup manifest cannot be
-- invalidated by a late message while the hard-delete worker is running.
create or replace function public.validate_message_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_au_pair_id uuid;
  v_family_deletion_requested_at timestamptz;
  v_au_pair_deletion_requested_at timestamptz;
begin
  if new.conversation_id is null or new.sender_id is null then
    raise exception 'Message conversation and sender are required';
  end if;

  select
    conversation.family_id,
    conversation.au_pair_id,
    family_profile.deletion_requested_at,
    au_pair_profile.deletion_requested_at
  into
    v_family_id,
    v_au_pair_id,
    v_family_deletion_requested_at,
    v_au_pair_deletion_requested_at
  from public.conversations conversation
  join public.profiles family_profile
    on family_profile.id = conversation.family_id
  join public.profiles au_pair_profile
    on au_pair_profile.id = conversation.au_pair_id
  where conversation.id = new.conversation_id;

  if v_family_id is null or v_au_pair_id is null then
    raise exception 'Conversation not found';
  end if;

  if new.sender_id <> v_family_id and new.sender_id <> v_au_pair_id then
    raise exception 'Message sender must be part of the conversation';
  end if;

  if
    v_family_deletion_requested_at is not null
    or v_au_pair_deletion_requested_at is not null
  then
    raise exception 'A conversation participant is no longer available';
  end if;

  return new;
end;
$$;

create function public.claim_scheduled_account_deletion(
  p_request_id uuid,
  p_cutoff timestamptz,
  p_stale_before timestamptz,
  p_processing_token uuid
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

  if p_processing_token is null then
    raise exception 'Processing token is required' using errcode = '22004';
  end if;

  select deletion_request.profile_id
  into v_profile_id
  from public.account_deletion_requests deletion_request
  where deletion_request.id = p_request_id;

  if v_profile_id is null then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_profile_id::text, 0)
  );

  v_profile_id := null;

  update public.account_deletion_requests deletion_request
  set
    status = 'processing',
    processing_started_at = now(),
    processing_token = p_processing_token,
    destructive_started_at = case
      when deletion_request.status = 'pending' then null
      else deletion_request.destructive_started_at
    end,
    confirmation_email_sending_at = null
  where deletion_request.id = p_request_id
    and (
      (
        deletion_request.status = 'pending'
        and deletion_request.scheduled_delete_at <= p_cutoff
      )
      or (
        deletion_request.status = 'processing'
        and (
          deletion_request.processing_started_at is null
          or deletion_request.processing_started_at <= p_stale_before
        )
      )
    )
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
          and not coalesce(profile.is_admin, false)
          and profile.deletion_requested_at is not null
          and profile.deletion_scheduled_at = deletion_request.scheduled_delete_at
          and profile.deletion_scheduled_at <= p_cutoff
      )
    )
  returning deletion_request.profile_id into v_profile_id;

  return v_profile_id;
end;
$$;

create function public.renew_account_deletion_claim(
  p_request_id uuid,
  p_processing_token uuid
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

  if p_processing_token is null then
    raise exception 'Processing token is required' using errcode = '22004';
  end if;

  select deletion_request.profile_id
  into v_profile_id
  from public.account_deletion_requests deletion_request
  where deletion_request.id = p_request_id;

  if v_profile_id is null then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_profile_id::text, 0)
  );

  if exists (
    select 1
    from public.profiles profile
    where profile.id = v_profile_id
      and coalesce(profile.is_admin, false)
  ) then
    update public.account_deletion_requests
    set
      status = 'cancelled',
      processing_started_at = null,
      processing_token = null,
      confirmation_email_sending_at = null
    where id = p_request_id
      and status = 'processing'
      and processing_token = p_processing_token;

    update public.profiles
    set
      deletion_requested_at = null,
      deletion_scheduled_at = null
    where id = v_profile_id;

    return null;
  end if;

  v_profile_id := null;

  update public.account_deletion_requests deletion_request
  set
    processing_started_at = now(),
    destructive_started_at = coalesce(
      deletion_request.destructive_started_at,
      now()
    )
  where deletion_request.id = p_request_id
    and deletion_request.status = 'processing'
    and deletion_request.processing_token = p_processing_token
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
          and not coalesce(profile.is_admin, false)
          and profile.deletion_requested_at is not null
          and profile.deletion_scheduled_at = deletion_request.scheduled_delete_at
      )
    )
  returning deletion_request.profile_id into v_profile_id;

  return v_profile_id;
end;
$$;

revoke all on function public.request_account_deletion(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_account_deletion(uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_scheduled_account_deletion(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.renew_account_deletion_claim(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.guard_profile_admin_promotion() from public, anon, authenticated, service_role;
revoke all on function public.delete_profile_photos_before_profile_cascade() from public, anon, authenticated, service_role;

grant execute on function public.request_account_deletion(uuid, text) to service_role;
grant execute on function public.cancel_account_deletion(uuid) to service_role;
grant execute on function public.claim_scheduled_account_deletion(uuid, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.renew_account_deletion_claim(uuid, uuid) to service_role;
