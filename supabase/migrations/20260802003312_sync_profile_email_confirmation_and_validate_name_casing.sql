-- Profiles created before email confirmation are retained for the verification
-- flow, but they are not members yet and must stay out of the admin directory.

alter table public.profiles
add column if not exists auth_email_confirmed boolean not null default false;

update public.profiles as profile
set auth_email_confirmed = auth_user.email_confirmed_at is not null
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.auth_email_confirmed is distinct from
    (auth_user.email_confirmed_at is not null);

comment on column public.profiles.auth_email_confirmed is
  'Server-owned mirror of whether Supabase Auth has confirmed the account email.';

create index if not exists profiles_confirmed_members_created_idx
on public.profiles (created_at desc)
where auth_email_confirmed = true
  and coalesce(is_admin, false) = false;

create or replace function public.sync_profile_auth_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set auth_email_confirmed = new.email_confirmed_at is not null
  where id = new.id
    and auth_email_confirmed is distinct from
      (new.email_confirmed_at is not null);

  return new;
end;
$$;

revoke all on function public.sync_profile_auth_email_confirmation()
from public, anon, authenticated, service_role;

drop trigger if exists sync_profile_auth_email_confirmation_trigger
on auth.users;

create trigger sync_profile_auth_email_confirmation_trigger
after insert or update of email_confirmed_at
on auth.users
for each row
execute function public.sync_profile_auth_email_confirmation();

-- Catch deliberately chaotic capitalization while retaining common legitimate
-- mixed-case names such as McDonald and de la Cruz.
create or replace function public.person_name_has_suspicious_casing(p_value text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from pg_catalog.regexp_split_to_table(
        public.normalize_person_name_case(p_value),
        '[^[:alpha:]]+'
      ) as part(value)
      where part.value <> ''
        and pg_catalog.char_length(part.value) >= 2
        and (
          (
            part.value = pg_catalog.upper(part.value)
            and part.value <> pg_catalog.lower(part.value)
          )
          or pg_catalog.char_length(
            pg_catalog.regexp_replace(
              pg_catalog.substr(part.value, 2),
              '[^[:upper:]]',
              '',
              'g'
            )
          ) >= 2
        )
    ),
    false
  );
$$;

revoke all on function public.person_name_has_suspicious_casing(text)
from public, anon, authenticated, service_role;

create or replace function public.normalize_profile_name_casing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.first_name := public.normalize_person_name_case(new.first_name);
  new.last_name := public.normalize_person_name_case(new.last_name);

  if public.person_name_has_suspicious_casing(new.first_name)
    or public.person_name_has_suspicious_casing(new.last_name)
  then
    raise exception 'Profile names must use normal capitalization'
      using errcode = '22023';
  end if;

  if new.account_type = 'family'
    and coalesce(pg_catalog.btrim(new.last_name), '') <> ''
    and pg_catalog.btrim(new.full_name) ~* '^the[[:space:]].+[[:space:]]family$'
    and (
      pg_catalog.btrim(new.full_name) = pg_catalog.lower(pg_catalog.btrim(new.full_name))
      or pg_catalog.btrim(new.full_name) = pg_catalog.upper(pg_catalog.btrim(new.full_name))
    )
  then
    new.full_name := 'The ' || new.last_name || ' family';
  else
    new.full_name := public.normalize_person_name_case(new.full_name);
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_profile_name_casing()
from public, anon, authenticated, service_role;

-- Keep the mirrored Auth state out of direct authenticated profile updates.
create or replace function public.protect_profile_server_owned_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
  v_activity_touch boolean := coalesce(
    pg_catalog.current_setting(
      'perfect_aupair.trusted_profile_activity_touch',
      true
    ) = '1',
    false
  );
begin
  if v_actor_role = 'service_role' then
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      'service_role',
      true
    );
    return new;
  end if;

  if
    (
      v_actor_role = ''
      and session_user in ('postgres', 'supabase_admin')
    )
    or pg_catalog.pg_trigger_depth() > 1
  then
    return new;
  end if;

  if
    new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.account_type is distinct from old.account_type
    or new.avatar_url is distinct from old.avatar_url
    or new.onboarding_completed is distinct from old.onboarding_completed
    or new.auth_email_confirmed is distinct from old.auth_email_confirmed
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
    or new.public_slug is distinct from old.public_slug
    or new.is_admin is distinct from old.is_admin
    or new.suspended_at is distinct from old.suspended_at
    or new.suspended_until is distinct from old.suspended_until
    or new.suspended_reason is distinct from old.suspended_reason
    or new.suspended_by is distinct from old.suspended_by
    or new.suspension_rule is distinct from old.suspension_rule
    or new.deletion_requested_at is distinct from old.deletion_requested_at
    or new.deletion_scheduled_at is distinct from old.deletion_scheduled_at
    or new.verification_status is distinct from old.verification_status
    or new.verification_requested_at is distinct from old.verification_requested_at
    or new.verification_reviewed_at is distinct from old.verification_reviewed_at
    or new.verification_rejected_reason is distinct from old.verification_rejected_reason
    or new.content_moderation_status is distinct from old.content_moderation_status
    or new.content_moderation_needs_review is distinct from old.content_moderation_needs_review
    or new.content_moderation_reviewed_at is distinct from old.content_moderation_reviewed_at
    or new.content_moderation_reviewed_by is distinct from old.content_moderation_reviewed_by
    or new.content_moderation_reason is distinct from old.content_moderation_reason
    or (
      new.last_active_at is distinct from old.last_active_at
      and not v_activity_touch
    )
  then
    raise exception 'Server-owned profile fields cannot be changed directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_server_owned_fields()
from public, anon, authenticated, service_role;
