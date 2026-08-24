-- Keep each recipient's copy of a conversation after the other participant
-- requests or completes account deletion. Participant UUIDs remain only as
-- pseudonymous conversation ownership keys; profile fields are never returned
-- once that profile is unavailable.

alter table public.conversations
drop constraint if exists conversations_family_id_fkey;

alter table public.conversations
drop constraint if exists conversations_au_pair_id_fkey;

alter table public.messages
drop constraint if exists messages_sender_id_fkey;

comment on column public.conversations.family_id is
  'Participant ownership key retained after profile deletion so the other participant keeps their conversation copy.';

comment on column public.conversations.au_pair_id is
  'Participant ownership key retained after profile deletion so the other participant keeps their conversation copy.';

comment on column public.messages.sender_id is
  'Pseudonymous sender key retained after profile deletion to preserve message attribution inside the recipient copy.';

create or replace function public.delete_conversations_without_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.conversations conversation
  where old.id in (conversation.family_id, conversation.au_pair_id)
    and not exists (
      select 1 from public.profiles family_profile
      where family_profile.id = conversation.family_id
    )
    and not exists (
      select 1 from public.profiles au_pair_profile
      where au_pair_profile.id = conversation.au_pair_id
    );

  return old;
end;
$$;

drop trigger if exists delete_conversations_without_profiles_trigger
on public.profiles;

create trigger delete_conversations_without_profiles_trigger
after delete on public.profiles
for each row execute function public.delete_conversations_without_profiles();

revoke all on function public.delete_conversations_without_profiles()
from public, anon, authenticated, service_role;

drop function if exists public.get_message_conversation_profile(uuid);

create function public.get_message_conversation_profile(
  p_conversation_id uuid
)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  country text,
  city text,
  primary_photo_path text,
  activity_status text,
  verification_status text,
  profile_available boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  with selected_conversation as (
    select
      conversation.id,
      case
        when conversation.family_id = (select auth.uid())
          then conversation.au_pair_id
        else conversation.family_id
      end as other_profile_id,
      case
        when conversation.family_id = (select auth.uid())
          then 'au_pair'::text
        else 'family'::text
      end as other_account_type
    from public.conversations conversation
    where (select auth.uid()) is not null
      and conversation.id = p_conversation_id
      and (conversation.family_id = (select auth.uid())
        or conversation.au_pair_id = (select auth.uid()))
  )
  select
    selected.other_profile_id,
    case when eligibility.is_available then profile.public_slug end,
    selected.other_account_type,
    case when eligibility.is_available then profile.full_name end,
    case when eligibility.is_available then profile.country end,
    case when eligibility.is_available then profile.city end,
    case when eligibility.is_available then primary_photo.storage_path end,
    case
      when eligibility.is_available
        then public.profile_activity_status(profile.last_active_at)
    end,
    case when eligibility.is_available then profile.verification_status end,
    eligibility.is_available
  from selected_conversation selected
  left join public.profiles profile on profile.id = selected.other_profile_id
  cross join lateral (
    select public.messaging_profile_is_eligible(profile.id) as is_available
  ) eligibility
  left join lateral (
    select photo.storage_path
    from public.profile_photos photo
    where photo.profile_id = profile.id
    order by photo.is_primary desc, photo.sort_order asc, photo.created_at asc
    limit 1
  ) primary_photo on eligibility.is_available
  where eligibility.is_available
    or profile.id is null
    or profile.deletion_requested_at is not null
    or profile.deletion_scheduled_at is not null
  limit 1;
$$;

revoke all on function public.get_message_conversation_profile(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_message_conversation_profile(uuid)
to authenticated;

drop function if exists public.get_message_inbox_cards();

create function public.get_message_inbox_cards()
returns table (
  conversation_id uuid,
  family_id uuid,
  au_pair_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  activity_at timestamptz,
  other_profile_id uuid,
  other_account_type text,
  other_public_slug text,
  other_full_name text,
  other_country text,
  other_city text,
  other_primary_photo_path text,
  other_activity_status text,
  other_verification_status text,
  other_profile_available boolean,
  last_message_id uuid,
  last_message_order_key bigint,
  last_message_sender_id uuid,
  last_message_body text,
  last_message_image_path text,
  last_message_image_mime_type text,
  last_message_video_path text,
  last_message_video_mime_type text,
  last_message_audio_path text,
  last_message_audio_mime_type text,
  last_message_created_at timestamptz,
  last_message_read_by_other boolean,
  unread_count integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with viewer_conversations as (
    select
      conversation.id,
      conversation.family_id,
      conversation.au_pair_id,
      conversation.created_at,
      conversation.updated_at,
      conversation.last_message_at,
      coalesce(conversation.last_message_at, conversation.created_at) as visibility_at,
      conversation_read.hidden_at,
      case
        when conversation.family_id = (select auth.uid())
          then conversation.au_pair_id
        else conversation.family_id
      end as other_profile_id,
      case
        when conversation.family_id = (select auth.uid())
          then 'au_pair'::text
        else 'family'::text
      end as other_account_type
    from public.conversations conversation
    left join public.conversation_reads conversation_read
      on conversation_read.user_id = (select auth.uid())
     and conversation_read.conversation_id = conversation.id
    where (select auth.uid()) is not null
      and (conversation.family_id = (select auth.uid())
        or conversation.au_pair_id = (select auth.uid()))
  )
  select
    viewer_conversation.id,
    viewer_conversation.family_id,
    viewer_conversation.au_pair_id,
    viewer_conversation.created_at,
    viewer_conversation.updated_at,
    viewer_conversation.last_message_at,
    coalesce(last_message.sent_at, viewer_conversation.created_at),
    viewer_conversation.other_profile_id,
    viewer_conversation.other_account_type,
    case when eligibility.is_available then profile.public_slug end,
    case when eligibility.is_available then profile.full_name end,
    case when eligibility.is_available then profile.country end,
    case when eligibility.is_available then profile.city end,
    case when eligibility.is_available then primary_photo.storage_path end,
    case
      when eligibility.is_available
        then public.profile_activity_status(profile.last_active_at)
    end,
    case when eligibility.is_available then profile.verification_status end,
    eligibility.is_available,
    last_message.id,
    last_message.order_key,
    last_message.sender_id,
    last_message.body,
    last_message.image_path,
    last_message.image_mime_type,
    last_message.video_path,
    last_message.video_mime_type,
    last_message.audio_path,
    last_message.audio_mime_type,
    last_message.sent_at,
    coalesce(
      last_message.sender_id = (select auth.uid())
      and other_read.last_read_at >= last_message.created_at,
      false
    ),
    (
      select pg_catalog.count(*)::integer
      from public.messages unread_message
      left join public.conversation_reads unread_read
        on unread_read.user_id = (select auth.uid())
       and unread_read.conversation_id = unread_message.conversation_id
      where unread_message.conversation_id = viewer_conversation.id
        and unread_message.sender_id <> (select auth.uid())
        and unread_message.created_at > coalesce(
          unread_read.last_read_at, timestamptz '1970-01-01 00:00:00+00'
        )
        and unread_message.created_at > coalesce(
          unread_read.hidden_at, timestamptz '1970-01-01 00:00:00+00'
        )
    )
  from viewer_conversations viewer_conversation
  left join public.profiles profile
    on profile.id = viewer_conversation.other_profile_id
  cross join lateral (
    select public.messaging_profile_is_eligible(profile.id) as is_available
  ) eligibility
  left join public.conversation_reads other_read
    on other_read.user_id = viewer_conversation.other_profile_id
   and other_read.conversation_id = viewer_conversation.id
  left join lateral (
    select photo.storage_path
    from public.profile_photos photo
    where photo.profile_id = profile.id
    order by photo.is_primary desc, photo.sort_order asc, photo.created_at asc
    limit 1
  ) primary_photo on eligibility.is_available
  left join lateral (
    select
      message.id,
      message.sender_id,
      message.body,
      message.image_path,
      message.image_mime_type,
      message.video_path,
      message.video_mime_type,
      message.audio_path,
      message.audio_mime_type,
      message.created_at,
      message.sent_at,
      message.order_key
    from public.messages message
    where message.conversation_id = viewer_conversation.id
      and (viewer_conversation.hidden_at is null
        or message.created_at > viewer_conversation.hidden_at)
    order by message.order_key desc
    limit 1
  ) last_message on true
  where (viewer_conversation.hidden_at is null
      or viewer_conversation.visibility_at > viewer_conversation.hidden_at)
    and (last_message.id is not null or exists (
      select 1
      from public.conversation_draft_viewers draft
      where draft.conversation_id = viewer_conversation.id
        and draft.user_id = (select auth.uid())
    ))
    and (
      eligibility.is_available
      or profile.id is null
      or profile.deletion_requested_at is not null
      or profile.deletion_scheduled_at is not null
    )
  order by last_message.order_key desc nulls last,
    viewer_conversation.created_at desc;
$$;

revoke all on function public.get_message_inbox_cards()
from public, anon, authenticated, service_role;
grant execute on function public.get_message_inbox_cards()
to authenticated;
