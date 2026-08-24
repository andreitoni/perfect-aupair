-- Bind database media references to the authenticated uploader, prevent
-- retained message media from being reattached, and bound empty-conversation
-- creation so a caller cannot fill another member's inbox.

do $$
begin
  if exists (
    select 1 from public.profile_photos media
    where (storage.foldername(media.storage_path))[1]
      is distinct from media.profile_id::text
  ) or exists (
    select 1 from public.profile_stories media
    where (storage.foldername(media.storage_path))[1]
      is distinct from media.profile_id::text
  ) or exists (
    select 1 from public.profile_videos media
    where (storage.foldername(media.storage_path))[1]
      is distinct from media.profile_id::text
  ) then
    raise exception 'Launch preflight failed: cross-owner profile media references exist.';
  end if;

  if exists (
    select 1 from public.messages message
    where (
      message.image_path is not null
      and (storage.foldername(message.image_path))[1]
        is distinct from message.conversation_id::text
    ) or (
      message.video_path is not null
      and (storage.foldername(message.video_path))[1]
        is distinct from message.conversation_id::text
    ) or (
      message.audio_path is not null
      and (storage.foldername(message.audio_path))[1]
        is distinct from message.conversation_id::text
    )
  ) then
    raise exception 'Launch preflight failed: cross-conversation message media references exist.';
  end if;

  if exists (
    select 1
    from public.messages message
    join public.retained_message_photos retained
      on retained.original_image_path = message.image_path
  ) or exists (
    select 1
    from public.messages message
    join public.retained_message_videos retained
      on retained.original_video_path = message.video_path
  ) or exists (
    select 1
    from public.messages message
    join public.retained_message_audio retained
      on retained.original_audio_path = message.audio_path
  ) then
    raise exception 'Launch preflight failed: retained media is still visibly referenced.';
  end if;

  if exists (
    select message.image_path
    from public.messages message
    where message.image_path is not null
    group by message.image_path
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Launch preflight failed: duplicate message image references exist.';
  end if;
end;
$$;

create or replace function public.enforce_authenticated_profile_media_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.role()), '');
  v_user_id uuid := (select auth.uid());
  v_bucket_id text := tg_argv[0];
begin
  if v_role = 'service_role'
    or (v_role = '' and session_user in ('postgres', 'supabase_admin'))
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.profile_id is not distinct from old.profile_id
    and new.storage_path is not distinct from old.storage_path
  then
    return new;
  end if;

  if v_user_id is null
    or new.profile_id <> v_user_id
    or (storage.foldername(new.storage_path))[1] is distinct from v_user_id::text
    or not exists (
      select 1
      from public.storage_upload_usage_events event
      where event.uploader_id = v_user_id
        and event.bucket_id = v_bucket_id
        and event.object_name = new.storage_path
        and event.committed_at is not null
        and event.deleted_at is null
        and (
          v_bucket_id <> 'profile-videos'
          or event.size_bytes = coalesce(
            (pg_catalog.to_jsonb(new)->>'size_bytes')::bigint,
            -1
          )
        )
    )
  then
    raise exception 'Invalid media reference' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_authenticated_profile_media_reference()
from public, anon, authenticated, service_role;

drop trigger if exists ab_enforce_profile_photo_reference_trigger
on public.profile_photos;
create trigger ab_enforce_profile_photo_reference_trigger
before insert or update of profile_id, storage_path on public.profile_photos
for each row execute function public.enforce_authenticated_profile_media_reference(
  'profile-photos'
);

drop trigger if exists ab_enforce_profile_story_reference_trigger
on public.profile_stories;
create trigger ab_enforce_profile_story_reference_trigger
before insert or update of profile_id, storage_path on public.profile_stories
for each row execute function public.enforce_authenticated_profile_media_reference(
  'profile-stories'
);

drop trigger if exists ab_enforce_profile_video_reference_trigger
on public.profile_videos;
create trigger ab_enforce_profile_video_reference_trigger
before insert or update of profile_id, storage_path on public.profile_videos
for each row execute function public.enforce_authenticated_profile_media_reference(
  'profile-videos'
);

create or replace function public.enforce_authenticated_message_media_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.role()), '');
  v_user_id uuid := (select auth.uid());
begin
  if v_role = 'service_role'
    or (v_role = '' and session_user in ('postgres', 'supabase_admin'))
  then
    return new;
  end if;

  if v_user_id is null or new.sender_id <> v_user_id then
    raise exception 'Invalid message sender' using errcode = '42501';
  end if;

  if (
    new.image_path is not null
    or new.video_path is not null
    or new.audio_path is not null
  ) and not public.database_feature_flag_enabled('message_media_uploads') then
    raise exception 'Message media uploads are disabled' using errcode = '42501';
  end if;

  if new.image_path is not null and (
    (storage.foldername(new.image_path))[1] is distinct from new.conversation_id::text
    or not exists (
      select 1 from public.storage_upload_usage_events event
      where event.uploader_id = new.sender_id
        and event.bucket_id = 'message-photos'
        and event.object_name = new.image_path
        and event.committed_at is not null
        and event.deleted_at is null
    )
    or exists (
      select 1 from public.retained_message_photos retained
      where retained.original_image_path = new.image_path
    )
    or exists (
      select 1 from public.messages message
      where message.image_path = new.image_path
    )
  ) then
    raise exception 'Invalid message image reference' using errcode = '42501';
  end if;

  if new.video_path is not null and (
    (storage.foldername(new.video_path))[1] is distinct from new.conversation_id::text
    or not exists (
      select 1 from public.storage_upload_usage_events event
      where event.uploader_id = new.sender_id
        and event.bucket_id = 'message-videos'
        and event.object_name = new.video_path
        and event.committed_at is not null
        and event.deleted_at is null
        and event.size_bytes = new.video_size_bytes
    )
    or exists (
      select 1 from public.retained_message_videos retained
      where retained.original_video_path = new.video_path
    )
    or exists (
      select 1 from public.messages message
      where message.video_path = new.video_path
    )
  ) then
    raise exception 'Invalid message video reference' using errcode = '42501';
  end if;

  if new.audio_path is not null and (
    (storage.foldername(new.audio_path))[1] is distinct from new.conversation_id::text
    or not exists (
      select 1 from public.storage_upload_usage_events event
      where event.uploader_id = new.sender_id
        and event.bucket_id = 'message-audio'
        and event.object_name = new.audio_path
        and event.committed_at is not null
        and event.deleted_at is null
        and event.size_bytes = new.audio_size_bytes
    )
    or exists (
      select 1 from public.retained_message_audio retained
      where retained.original_audio_path = new.audio_path
    )
    or exists (
      select 1 from public.messages message
      where message.audio_path = new.audio_path
    )
  ) then
    raise exception 'Invalid message audio reference' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_authenticated_message_media_reference()
from public, anon, authenticated, service_role;

drop trigger if exists zy_enforce_message_media_reference_trigger
on public.messages;
create trigger zy_enforce_message_media_reference_trigger
before insert on public.messages
for each row execute function public.enforce_authenticated_message_media_reference();

create unique index if not exists messages_image_path_unique_idx
on public.messages (image_path)
where image_path is not null;

-- Profile photos are delivered only through the counted same-origin proxy.
drop policy if exists "Users can view their own profile photo files"
on storage.objects;

alter table public.conversations
add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.conversations conversation
set created_by = (
  select message.sender_id
  from public.messages message
  where message.conversation_id = conversation.id
  order by message.order_key asc
  limit 1
)
where conversation.created_by is null
  and exists (
    select 1 from public.messages message
    where message.conversation_id = conversation.id
  );

create index if not exists conversations_created_by_created_at_idx
on public.conversations (created_by, created_at desc)
where created_by is not null;

create table if not exists public.conversation_draft_viewers (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_draft_viewers enable row level security;
revoke all on table public.conversation_draft_viewers
from public, anon, authenticated;
grant select, insert, update, delete
on public.conversation_draft_viewers to service_role;

insert into public.conversation_draft_viewers (conversation_id, user_id)
select conversation.id, conversation.created_by
from public.conversations conversation
where conversation.created_by is not null
  and not exists (
    select 1 from public.messages message
    where message.conversation_id = conversation.id
  )
on conflict (conversation_id, user_id) do nothing;

create table if not exists public.conversation_creation_usage_events (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.conversation_creation_usage_events enable row level security;
revoke all on table public.conversation_creation_usage_events
from public, anon, authenticated;
grant select, insert, update, delete
on public.conversation_creation_usage_events to service_role;

create index if not exists conversation_creation_usage_actor_created_idx
on public.conversation_creation_usage_events (actor_id, created_at desc);

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
    and public.public_profile_is_eligible(profile.id, true);

  select profile.account_type into v_target_type
  from public.profiles profile
  where profile.id = p_profile_id
    and public.public_profile_is_eligible(profile.id, true);

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
    pg_catalog.hashtextextended(
      'conversation-creation:' || v_current_profile_id::text,
      0
    )
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

  if v_ten_minute_count >= 20
    or v_daily_count >= 100
    or v_total_count >= 500
  then
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
      conversation_id,
      actor_id,
      created_at
    ) values (
      v_conversation_id,
      v_current_profile_id,
      v_now
    );
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

drop policy if exists "Conversation participants can view conversations"
on public.conversations;

create or replace function public.conversation_visible_to_current_user(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations conversation
    where conversation.id = p_conversation_id
      and (
        conversation.family_id = (select auth.uid())
        or conversation.au_pair_id = (select auth.uid())
      )
      and (
        exists (
          select 1
          from public.conversation_draft_viewers draft
          where draft.conversation_id = conversation.id
            and draft.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.messages message
          where message.conversation_id = conversation.id
        )
      )
  );
$$;

revoke all on function public.conversation_visible_to_current_user(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.conversation_visible_to_current_user(uuid)
to authenticated, service_role;

create policy "Conversation participants can view conversations"
on public.conversations for select to authenticated
using (public.conversation_visible_to_current_user(id));

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
      conversation.created_by,
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
      and (
        conversation.family_id = (select auth.uid())
        or conversation.au_pair_id = (select auth.uid())
      )
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
          unread_read.last_read_at,
          timestamptz '1970-01-01 00:00:00+00'
        )
        and unread_message.created_at > coalesce(
          unread_read.hidden_at,
          timestamptz '1970-01-01 00:00:00+00'
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
      and (
        viewer_conversation.hidden_at is null
        or message.created_at > viewer_conversation.hidden_at
      )
    order by message.order_key desc
    limit 1
  ) last_message on true
  where (
      viewer_conversation.hidden_at is null
      or viewer_conversation.visibility_at > viewer_conversation.hidden_at
    )
    and (
      last_message.id is not null
      or exists (
        select 1
        from public.conversation_draft_viewers draft
        where draft.conversation_id = viewer_conversation.id
          and draft.user_id = (select auth.uid())
      )
    )
    and profile.onboarding_completed = true
    and profile.public_slug is not null
    and profile.suspended_at is null
    and profile.deletion_requested_at is null
    and profile.deletion_scheduled_at is null
    and profile.content_moderation_status = 'approved'
    and coalesce(profile.is_admin, false) = false
    and primary_photo.storage_path is not null
  order by last_message.order_key desc nulls last, viewer_conversation.created_at desc;
$$;

revoke all on function public.get_message_inbox_cards()
from public, anon, authenticated, service_role;
grant execute on function public.get_message_inbox_cards()
to authenticated;
