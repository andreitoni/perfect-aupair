-- Host families receive the same explicit social-media consent choice as au
-- pairs, both through account settings and a one-time system notification.

alter table public.profiles
drop constraint if exists profiles_social_media_consent_account_type_check;

alter table public.profiles
add constraint profiles_social_media_consent_account_type_check
check (
  social_media_consent_status = 'not_asked'
  or account_type in ('au_pair', 'family')
);

comment on column public.profiles.social_media_consent_status is
  'Profile owner consent to use their public profile photo, name, and description on Perfect AuPair social media accounts.';
comment on column public.profiles.social_media_consent_updated_at is
  'Timestamp of the profile owner''s latest explicit social media consent choice.';

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
  elsif new.social_media_consent_updated_at is distinct from old.social_media_consent_updated_at then
    raise exception 'Social media consent timestamp cannot be changed directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_social_media_consent()
from public, anon, authenticated, service_role;

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
    'Social media consent request',
    'Choose whether Perfect AuPair may feature your profile on its social media accounts.',
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

drop trigger if exists create_social_media_consent_notification_trigger
on public.profiles;

create trigger create_social_media_consent_notification_trigger
after insert or update of account_type
on public.profiles
for each row
when (new.account_type in ('au_pair', 'family'))
execute function public.create_social_media_consent_notification();

insert into public.system_notifications (
  recipient_id,
  type,
  title,
  body,
  dedupe_key
)
select
  profile.id,
  'social_media_consent_request',
  'Social media consent request',
  'Choose whether Perfect AuPair may feature your profile on its social media accounts.',
  'social_media_consent_request:' || profile.id::text
from public.profiles profile
where profile.account_type = 'family'
  and not exists (
    select 1
    from public.system_notifications existing
    where existing.recipient_id = profile.id
      and existing.type = 'social_media_consent_request'
  )
on conflict (dedupe_key) do nothing;
