-- Au pairs can explicitly accept or decline the use of their public profile
-- photo, name, and description on Perfect AuPair social media accounts.
-- This migration intentionally creates no notification rows; outreach will be
-- started separately by the operator when ready.

alter table public.profiles
add column if not exists social_media_consent_status text not null default 'not_asked',
add column if not exists social_media_consent_updated_at timestamptz;

alter table public.profiles
add constraint profiles_social_media_consent_status_check
check (
  social_media_consent_status in ('not_asked', 'accepted', 'declined')
),
add constraint profiles_social_media_consent_account_type_check
check (
  account_type = 'au_pair'
  or social_media_consent_status = 'not_asked'
),
add constraint profiles_social_media_consent_timestamp_check
check (
  (
    social_media_consent_status = 'not_asked'
    and social_media_consent_updated_at is null
  )
  or (
    social_media_consent_status in ('accepted', 'declined')
    and social_media_consent_updated_at is not null
  )
);

comment on column public.profiles.social_media_consent_status is
  'Au pair consent to use their public profile photo, name, and description on Perfect AuPair social media accounts.';
comment on column public.profiles.social_media_consent_updated_at is
  'Timestamp of the au pair''s latest explicit social media consent choice.';

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
  then
    return new;
  end if;

  -- Trusted service operations and migration SQL must supply a consistent
  -- status/timestamp pair, which remains enforced by the table constraint.
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

  if old.account_type is distinct from 'au_pair' or new.account_type is distinct from 'au_pair' then
    raise exception 'Social media consent is only available to au pairs'
      using errcode = '42501';
  end if;

  if new.social_media_consent_status not in ('accepted', 'declined') then
    raise exception 'Choose accepted or declined for social media consent'
      using errcode = '22023';
  end if;

  if new.social_media_consent_status is distinct from old.social_media_consent_status then
    new.social_media_consent_updated_at := pg_catalog.clock_timestamp();
  elsif new.social_media_consent_updated_at is distinct from old.social_media_consent_updated_at then
    raise exception 'Social media consent timestamp cannot be changed directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_social_media_consent()
from public, anon, authenticated, service_role;

create trigger ab_guard_profile_social_media_consent_trigger
before update of social_media_consent_status, social_media_consent_updated_at
on public.profiles
for each row
execute function public.guard_profile_social_media_consent();
