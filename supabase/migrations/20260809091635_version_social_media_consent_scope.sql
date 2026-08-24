-- Keep existing consent decisions under their original, main-photo-only scope.
-- New decisions use scope version 2, which explicitly covers any profile photo.

alter table public.profiles
add column if not exists social_media_consent_scope_version smallint;

update public.profiles
set social_media_consent_scope_version = 1
where social_media_consent_status in ('accepted', 'declined')
  and social_media_consent_scope_version is null;

alter table public.profiles
drop constraint if exists profiles_social_media_consent_scope_version_check;

alter table public.profiles
add constraint profiles_social_media_consent_scope_version_check
check (
  (
    social_media_consent_status = 'not_asked'
    and social_media_consent_scope_version is null
  )
  or (
    social_media_consent_status in ('accepted', 'declined')
    and social_media_consent_scope_version in (1, 2)
  )
);

comment on column public.profiles.social_media_consent_status is
  'Profile owner consent to feature profile content on Perfect AuPair social media accounts; interpret together with social_media_consent_scope_version.';

comment on column public.profiles.social_media_consent_scope_version is
  'Consent wording version: 1 covers the main profile photo; 2 covers any current or future profile photo. Null means no choice yet.';

create or replace function public.guard_profile_social_media_consent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text := coalesce(
    pg_catalog.current_setting('request.jwt.claim.role', true),
    ''
  );
begin
  if
    new.social_media_consent_status is not distinct from old.social_media_consent_status
    and new.social_media_consent_updated_at is not distinct from old.social_media_consent_updated_at
    and new.social_media_consent_scope_version is not distinct from old.social_media_consent_scope_version
  then
    return new;
  end if;

  if
    v_actor_role = 'service_role'
    or (
      v_actor_id is null
      and session_user in ('postgres', 'supabase_admin')
    )
  then
    return new;
  end if;

  if v_actor_id is null or v_actor_id is distinct from old.id then
    raise exception 'Social media consent can only be changed by the profile owner'
      using errcode = '42501';
  end if;

  if
    old.account_type not in ('au_pair', 'family')
    or new.account_type not in ('au_pair', 'family')
  then
    raise exception 'Social media consent is only available to au pair and family profiles'
      using errcode = '42501';
  end if;

  if new.social_media_consent_status not in ('accepted', 'declined') then
    raise exception 'Choose accepted or declined for social media consent'
      using errcode = '22023';
  end if;

  if new.social_media_consent_status is distinct from old.social_media_consent_status then
    new.social_media_consent_updated_at := pg_catalog.clock_timestamp();
    new.social_media_consent_scope_version := 2;
  elsif
    new.social_media_consent_updated_at is distinct from old.social_media_consent_updated_at
    or new.social_media_consent_scope_version is distinct from old.social_media_consent_scope_version
  then
    raise exception 'Social media consent metadata cannot be changed directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_social_media_consent()
from public, anon, authenticated, service_role;

drop trigger if exists ab_guard_profile_social_media_consent_trigger
on public.profiles;

create trigger ab_guard_profile_social_media_consent_trigger
before update of
  social_media_consent_status,
  social_media_consent_updated_at,
  social_media_consent_scope_version
on public.profiles
for each row
execute function public.guard_profile_social_media_consent();

create or replace function public.create_social_media_consent_notification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.account_type not in ('au_pair', 'family') then
    return new;
  end if;

  insert into public.system_notifications (
    recipient_id,
    type,
    title,
    body,
    dedupe_key
  )
  select
    new.id,
    'social_media_consent_request',
    'Help suitable matches discover you',
    'May Perfect AuPair feature any of your profile photos, name and description on social media so suitable matches can discover and contact you?',
    'social_media_consent_request:' || new.id::text
  where not exists (
    select 1
    from public.system_notifications existing
    where existing.recipient_id = new.id
      and existing.type = 'social_media_consent_request'
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.create_social_media_consent_notification()
from public, anon, authenticated, service_role;

update public.system_notifications
set
  title = 'Help suitable matches discover you',
  body = 'May Perfect AuPair feature any of your profile photos, name and description on social media so suitable matches can discover and contact you?'
where type = 'social_media_consent_request';
