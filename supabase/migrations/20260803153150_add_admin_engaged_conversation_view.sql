create view public.admin_live_profiles
with (security_invoker = true)
as
select
  profile.id,
  profile.account_type
from public.profiles profile
where profile.account_type in ('family', 'au_pair')
  and profile.onboarding_completed = true
  and profile.public_slug is not null
  and profile.suspended_at is null
  and profile.deletion_requested_at is null
  and profile.deletion_scheduled_at is null
  and profile.content_moderation_status = 'approved'
  and coalesce(profile.is_admin, false) = false
  and exists (
    select 1
    from public.profile_photos photo
    where photo.profile_id = profile.id
  );

revoke all on table public.admin_live_profiles from public, anon, authenticated;
grant select on table public.admin_live_profiles to service_role;

create view public.admin_engaged_conversations
with (security_invoker = true)
as
select
  conversation.id,
  conversation.family_id,
  conversation.au_pair_id,
  conversation.created_at,
  conversation.updated_at,
  conversation.last_message_at
from public.conversations conversation
where exists (
    select 1
    from public.message_notification_claims family_message
    where family_message.conversation_id = conversation.id
      and family_message.sender_id = conversation.family_id
  )
  and exists (
    select 1
    from public.message_notification_claims au_pair_message
    where au_pair_message.conversation_id = conversation.id
      and au_pair_message.sender_id = conversation.au_pair_id
  );

revoke all on table public.admin_engaged_conversations from public, anon, authenticated;
grant select on table public.admin_engaged_conversations to service_role;

comment on view public.admin_live_profiles is
  'Service-role-only profiles that meet the public catalog visibility requirements.';

comment on view public.admin_engaged_conversations is
  'Service-role-only conversations in which both participants have sent at least one message.';
