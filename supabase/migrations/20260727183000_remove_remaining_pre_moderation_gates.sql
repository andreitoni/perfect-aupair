-- Stories and intro videos publish immediately. Content moderation metadata is
-- retained only for explicit administrator safety actions; it never creates a
-- pre-publication waiting state. Messaging is independent from content review.

alter table public.profile_stories
alter column content_moderation_status set default 'approved';

alter table public.profile_videos
alter column content_moderation_status set default 'approved';

update public.profile_stories
set
  content_moderation_status = 'approved',
  content_moderation_reviewed_at = null,
  content_moderation_reviewed_by = null,
  content_moderation_reason = null
where content_moderation_status = 'pending';

update public.profile_videos
set
  content_moderation_status = 'approved',
  content_moderation_reviewed_at = null,
  content_moderation_reviewed_by = null,
  content_moderation_reason = null
where content_moderation_status = 'pending';

create or replace function public.prepare_authenticated_profile_story_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
  v_now timestamptz;
begin
  if v_actor_role = 'service_role'
    or (v_actor_role = '' and session_user in ('postgres', 'supabase_admin'))
  then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if tg_op = 'INSERT' then
    v_now := pg_catalog.clock_timestamp();
    new.created_at := v_now;
    new.expires_at := v_now + interval '24 hours';
    new.content_moderation_status := 'approved';
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason := null;
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
    or new.storage_path is distinct from old.storage_path
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
    or new.content_moderation_status is distinct from old.content_moderation_status
    or new.content_moderation_reviewed_at is distinct from old.content_moderation_reviewed_at
    or new.content_moderation_reviewed_by is distinct from old.content_moderation_reviewed_by
    or new.content_moderation_reason is distinct from old.content_moderation_reason
  then
    raise exception 'Story lifecycle fields are server-owned'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_authenticated_profile_story_write()
from public, anon, authenticated, service_role;

create or replace function public.enforce_profile_video_moderation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.role()), '');
begin
  if v_role = 'service_role'
    or (v_role = '' and session_user in ('postgres', 'supabase_admin'))
  then
    return new;
  end if;

  if v_role <> 'authenticated' then
    raise exception 'Authenticated profile required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path then
    new.content_moderation_status := 'approved';
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason := null;
  else
    new.content_moderation_status := old.content_moderation_status;
    new.content_moderation_reviewed_at := old.content_moderation_reviewed_at;
    new.content_moderation_reviewed_by := old.content_moderation_reviewed_by;
    new.content_moderation_reason := old.content_moderation_reason;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_profile_video_moderation_state()
from public, anon, authenticated, service_role;

-- A one-time, leased delivery record makes the admin email correspond to the
-- first moment a completed profile with a photo is genuinely public.
create table if not exists public.admin_profile_publication_notifications (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  claim_token uuid,
  claimed_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((claim_token is null) = (claimed_until is null))
);

alter table public.admin_profile_publication_notifications enable row level security;
revoke all on table public.admin_profile_publication_notifications
from public, anon, authenticated;
grant select, insert, update, delete
on table public.admin_profile_publication_notifications to service_role;

-- Do not emit retrospective "new profile" emails for members who were already
-- public when this delivery ledger was introduced.
insert into public.admin_profile_publication_notifications (
  profile_id,
  sent_at,
  created_at,
  updated_at
)
select
  profile.id,
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp()
from public.profiles profile
where public.public_profile_is_eligible(profile.id, true)
on conflict (profile_id) do nothing;

create or replace function public.claim_admin_profile_publication_notification(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_claimed_token uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_profile_id is null
    or not public.public_profile_is_eligible(p_profile_id, true)
  then
    return null;
  end if;

  insert into public.admin_profile_publication_notifications (
    profile_id,
    claim_token,
    claimed_until,
    updated_at
  ) values (
    p_profile_id,
    v_token,
    v_now + interval '5 minutes',
    v_now
  )
  on conflict (profile_id) do update
  set
    claim_token = excluded.claim_token,
    claimed_until = excluded.claimed_until,
    updated_at = excluded.updated_at
  where admin_profile_publication_notifications.sent_at is null
    and (
      admin_profile_publication_notifications.claimed_until is null
      or admin_profile_publication_notifications.claimed_until <= v_now
    )
  returning claim_token into v_claimed_token;

  return v_claimed_token;
end;
$$;

create or replace function public.complete_admin_profile_publication_notification(
  p_profile_id uuid,
  p_claim_token uuid,
  p_sent_at timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.admin_profile_publication_notifications
    set
      sent_at = p_sent_at,
      claim_token = null,
      claimed_until = null,
      updated_at = pg_catalog.clock_timestamp()
    where coalesce((select auth.role()), '') = 'service_role'
      and profile_id = p_profile_id
      and claim_token = p_claim_token
      and sent_at is null
    returning 1
  )
  select exists (select 1 from updated);
$$;

create or replace function public.release_admin_profile_publication_notification(
  p_profile_id uuid,
  p_claim_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.admin_profile_publication_notifications
    set
      claim_token = null,
      claimed_until = null,
      updated_at = pg_catalog.clock_timestamp()
    where coalesce((select auth.role()), '') = 'service_role'
      and profile_id = p_profile_id
      and claim_token = p_claim_token
      and sent_at is null
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke all on function public.claim_admin_profile_publication_notification(uuid)
from public, anon, authenticated;
revoke all on function public.complete_admin_profile_publication_notification(uuid, uuid, timestamptz)
from public, anon, authenticated;
revoke all on function public.release_admin_profile_publication_notification(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.claim_admin_profile_publication_notification(uuid)
to service_role;
grant execute on function public.complete_admin_profile_publication_notification(uuid, uuid, timestamptz)
to service_role;
grant execute on function public.release_admin_profile_publication_notification(uuid, uuid)
to service_role;

-- Messaging eligibility intentionally excludes content moderation state.
create or replace function public.messaging_profile_is_eligible(
  p_profile_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.account_type in ('family', 'au_pair')
      and profile.onboarding_completed = true
      and profile.public_slug is not null
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.deletion_scheduled_at is null
      and coalesce(profile.is_admin, false) = false
      and exists (
        select 1 from public.profile_photos photo
        where photo.profile_id = profile.id
      )
  );
$$;

revoke all on function public.messaging_profile_is_eligible(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.messaging_profile_is_eligible(uuid)
to authenticated, service_role;

create or replace function public.message_send_is_allowed(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select p_sender_id is not null
    and p_sender_id = (select auth.uid())
    and public.database_feature_flag_enabled('message_send')
    and exists (
      select 1
      from public.conversations conversation
      join public.profiles family_profile on family_profile.id = conversation.family_id
      join public.profiles au_pair_profile on au_pair_profile.id = conversation.au_pair_id
      where conversation.id = p_conversation_id
        and p_sender_id in (conversation.family_id, conversation.au_pair_id)
        and not public.profile_pair_blocked(conversation.family_id, conversation.au_pair_id)
        and family_profile.account_type = 'family'
        and au_pair_profile.account_type = 'au_pair'
        and public.messaging_profile_is_eligible(family_profile.id)
        and public.messaging_profile_is_eligible(au_pair_profile.id)
    );
$$;

revoke all on function public.message_send_is_allowed(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.message_send_is_allowed(uuid, uuid)
to authenticated, service_role;

create or replace function public.create_or_get_conversation(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_profile_id uuid := (select auth.uid());
  v_current_type text;
  v_target_type text;
  v_family_id uuid;
  v_au_pair_id uuid;
  v_conversation_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ten_minute_count integer;
  v_daily_count integer;
  v_total_count integer;
begin
  if v_current_profile_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_profile_id is null or p_profile_id = v_current_profile_id then
    raise exception 'You cannot message this profile' using errcode = '42501';
  end if;

  if public.profile_pair_blocked(v_current_profile_id, p_profile_id) then
    raise exception 'This profile cannot receive messages from you'
      using errcode = '42501';
  end if;

  select profile.account_type into v_current_type
  from public.profiles profile
  where profile.id = v_current_profile_id
    and public.messaging_profile_is_eligible(profile.id);

  select profile.account_type into v_target_type
  from public.profiles profile
  where profile.id = p_profile_id
    and public.messaging_profile_is_eligible(profile.id);

  if v_current_type is null or v_current_type not in ('family', 'au_pair') then
    raise exception 'Your profile is not available' using errcode = '42501';
  end if;

  if v_target_type is null or v_target_type not in ('family', 'au_pair') then
    raise exception 'Target profile is not available' using errcode = '42501';
  end if;

  if v_current_type = v_target_type then
    raise exception 'You can only message the opposite account type'
      using errcode = '42501';
  end if;

  if v_current_type = 'family' then
    v_family_id := v_current_profile_id;
    v_au_pair_id := p_profile_id;
  else
    v_family_id := p_profile_id;
    v_au_pair_id := v_current_profile_id;
  end if;

  select conversation.id into v_conversation_id
  from public.conversations conversation
  where conversation.family_id = v_family_id
    and conversation.au_pair_id = v_au_pair_id;

  if v_conversation_id is not null then
    update public.conversations conversation
    set created_by = v_current_profile_id
    where conversation.id = v_conversation_id
      and conversation.created_by is null
      and not exists (
        select 1 from public.messages message
        where message.conversation_id = conversation.id
      );
    insert into public.conversation_draft_viewers (conversation_id, user_id)
    values (v_conversation_id, v_current_profile_id)
    on conflict (conversation_id, user_id) do nothing;
    return v_conversation_id;
  end if;

  if not public.database_feature_flag_enabled('message_send') then
    raise exception 'Messaging is temporarily unavailable' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('conversation-creation:' || v_current_profile_id::text, 0)
  );

  select conversation.id into v_conversation_id
  from public.conversations conversation
  where conversation.family_id = v_family_id
    and conversation.au_pair_id = v_au_pair_id;

  if v_conversation_id is not null then
    insert into public.conversation_draft_viewers (conversation_id, user_id)
    values (v_conversation_id, v_current_profile_id)
    on conflict (conversation_id, user_id) do nothing;
    return v_conversation_id;
  end if;

  delete from public.conversation_creation_usage_events event
  where event.actor_id = v_current_profile_id
    and event.created_at < v_now - interval '30 days';

  select pg_catalog.count(*)::integer into v_ten_minute_count
  from public.conversation_creation_usage_events event
  where event.actor_id = v_current_profile_id
    and event.created_at > v_now - interval '10 minutes';

  select pg_catalog.count(*)::integer into v_daily_count
  from public.conversation_creation_usage_events event
  where event.actor_id = v_current_profile_id
    and event.created_at > v_now - interval '24 hours';

  select pg_catalog.count(*)::integer into v_total_count
  from public.conversations conversation
  where conversation.created_by = v_current_profile_id;

  if v_ten_minute_count >= 20 or v_daily_count >= 100 or v_total_count >= 500 then
    raise exception 'Too many new conversations. Try again later.'
      using errcode = '42501';
  end if;

  insert into public.conversations (family_id, au_pair_id, created_by)
  values (v_family_id, v_au_pair_id, v_current_profile_id)
  on conflict (family_id, au_pair_id) do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select conversation.id into v_conversation_id
    from public.conversations conversation
    where conversation.family_id = v_family_id
      and conversation.au_pair_id = v_au_pair_id;
  else
    insert into public.conversation_creation_usage_events (
      conversation_id, actor_id, created_at
    ) values (v_conversation_id, v_current_profile_id, v_now);
  end if;

  if v_conversation_id is null then
    raise exception 'Could not create conversation';
  end if;

  insert into public.conversation_draft_viewers (conversation_id, user_id)
  values (v_conversation_id, v_current_profile_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke all on function public.create_or_get_conversation(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.create_or_get_conversation(uuid)
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
      conversation_read.hidden_at
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
    profile.id,
    profile.account_type,
    profile.public_slug,
    profile.full_name,
    profile.country,
    profile.city,
    primary_photo.storage_path,
    public.profile_activity_status(profile.last_active_at),
    profile.verification_status,
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
  join public.profiles profile
    on profile.id = case
      when viewer_conversation.family_id = (select auth.uid())
        then viewer_conversation.au_pair_id
      else viewer_conversation.family_id
    end
  left join public.conversation_reads other_read
    on other_read.user_id = profile.id
   and other_read.conversation_id = viewer_conversation.id
  left join lateral (
    select photo.storage_path
    from public.profile_photos photo
    where photo.profile_id = profile.id
    order by photo.is_primary desc, photo.sort_order asc, photo.created_at asc
    limit 1
  ) primary_photo on true
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
    and public.messaging_profile_is_eligible(profile.id)
  order by last_message.order_key desc nulls last,
    viewer_conversation.created_at desc;
$$;

revoke all on function public.get_message_inbox_cards()
from public, anon, authenticated, service_role;
grant execute on function public.get_message_inbox_cards()
to authenticated;
