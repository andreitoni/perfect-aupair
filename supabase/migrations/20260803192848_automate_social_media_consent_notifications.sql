-- Deliver the social-media consent request to every au pair exactly once,
-- including profiles created after the initial outreach.

create or replace function public.create_social_media_consent_notification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.account_type is distinct from 'au_pair' then
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
when (new.account_type = 'au_pair')
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
where profile.account_type = 'au_pair'
  and not exists (
    select 1
    from public.system_notifications existing
    where existing.recipient_id = profile.id
      and existing.type = 'social_media_consent_request'
  )
on conflict (dedupe_key) do nothing;
