-- Keep profile activity best-effort. Parallel RSC requests for the same stale
-- profile must not queue behind one row lock and consume the request timeout.
create or replace function public.touch_profile_activity()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_touched_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-activity:' || v_user_id::text,
      0
    )
  ) then
    perform pg_catalog.set_config(
      'perfect_aupair.trusted_profile_activity_touch',
      '1',
      true
    );

    with touch_target as (
      select profile.id
      from public.profiles profile
      where profile.id = v_user_id
        and profile.onboarding_completed = true
        and profile.suspended_at is null
        and profile.deletion_requested_at is null
        and profile.deletion_scheduled_at is null
        and coalesce(profile.is_admin, false) = false
        and (
          profile.last_active_at is null
          or profile.last_active_at <= v_now - interval '5 minutes'
        )
      for update skip locked
    )
    update public.profiles profile
    set last_active_at = v_now
    from touch_target
    where profile.id = touch_target.id
    returning profile.last_active_at into v_touched_at;
  end if;

  if v_touched_at is null then
    select profile.last_active_at
    into v_touched_at
    from public.profiles profile
    where profile.id = v_user_id;
  end if;

  return v_touched_at;
end;
$$;

revoke all on function public.touch_profile_activity()
from public, anon, authenticated, service_role;
grant execute on function public.touch_profile_activity()
to authenticated;

-- The primary key starts with user_id. This reverse lookup index keeps the
-- conversation FK cascade and moderation cleanup bounded.
create index if not exists conversation_reads_conversation_id_idx
on public.conversation_reads (conversation_id);

-- The UNIQUE constraint already owns conversations_unique_pair. The second
-- identical unique index adds write work without adding another access path.
drop index if exists public.conversations_family_au_pair_unique_idx;

-- The ALL policy already grants the same owner-only SELECT predicate.
drop policy if exists "Users can view own conversation reads"
on public.conversation_reads;

-- Reuse the viewer's read state already joined once per conversation. The old
-- unread subquery joined conversation_reads again for every candidate message.
create or replace function public.get_message_inbox_cards()
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
  with viewer as (
    select (select auth.uid()) as id
  ),
  viewer_conversations as (
    select
      viewer.id as viewer_id,
      conversation.id,
      conversation.family_id,
      conversation.au_pair_id,
      conversation.created_at,
      conversation.updated_at,
      conversation.last_message_at,
      coalesce(conversation.last_message_at, conversation.created_at) as visibility_at,
      conversation_read.last_read_at,
      conversation_read.hidden_at,
      case
        when conversation.family_id = viewer.id
          then conversation.au_pair_id
        else conversation.family_id
      end as other_profile_id,
      case
        when conversation.family_id = viewer.id
          then 'au_pair'::text
        else 'family'::text
      end as other_account_type
    from viewer
    join public.conversations conversation
      on viewer.id is not null
     and viewer.id in (conversation.family_id, conversation.au_pair_id)
    left join public.conversation_reads conversation_read
      on conversation_read.user_id = viewer.id
     and conversation_read.conversation_id = conversation.id
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
      last_message.sender_id = viewer_conversation.viewer_id
      and other_read.last_read_at >= last_message.created_at,
      false
    ),
    coalesce(unread_state.unread_count, 0)
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
      and (
        viewer_conversation.hidden_at is null
        or message.created_at > viewer_conversation.hidden_at
      )
    order by message.order_key desc
    limit 1
  ) last_message on true
  left join lateral (
    select pg_catalog.count(*)::integer as unread_count
    from public.messages unread_message
    where unread_message.conversation_id = viewer_conversation.id
      and unread_message.sender_id <> viewer_conversation.viewer_id
      and unread_message.created_at > greatest(
        coalesce(
          viewer_conversation.last_read_at,
          timestamptz '1970-01-01 00:00:00+00'
        ),
        coalesce(
          viewer_conversation.hidden_at,
          timestamptz '1970-01-01 00:00:00+00'
        )
      )
  ) unread_state on true
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
          and draft.user_id = viewer_conversation.viewer_id
      )
    )
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

-- Poll only the fields that participate in the client fingerprint. This avoids
-- reloading profile copy, photos and message bodies every 30 seconds.
create or replace function public.get_message_inbox_fingerprint()
returns table (
  conversation_id uuid,
  updated_at timestamptz,
  last_message_id uuid,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  last_message_read_by_other boolean,
  unread_count integer,
  other_profile_available boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  with viewer as (
    select (select auth.uid()) as id
  ),
  viewer_conversations as (
    select
      viewer.id as viewer_id,
      conversation.id,
      conversation.family_id,
      conversation.au_pair_id,
      conversation.created_at,
      conversation.updated_at,
      conversation.last_message_at,
      coalesce(conversation.last_message_at, conversation.created_at) as visibility_at,
      conversation_read.last_read_at,
      conversation_read.hidden_at,
      case
        when conversation.family_id = viewer.id
          then conversation.au_pair_id
        else conversation.family_id
      end as other_profile_id
    from viewer
    join public.conversations conversation
      on viewer.id is not null
     and viewer.id in (conversation.family_id, conversation.au_pair_id)
    left join public.conversation_reads conversation_read
      on conversation_read.user_id = viewer.id
     and conversation_read.conversation_id = conversation.id
  )
  select
    viewer_conversation.id,
    viewer_conversation.updated_at,
    last_message.id,
    last_message.sender_id,
    last_message.sent_at,
    coalesce(
      last_message.sender_id = viewer_conversation.viewer_id
      and other_read.last_read_at >= last_message.created_at,
      false
    ),
    coalesce(unread_state.unread_count, 0),
    eligibility.is_available
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
    select
      message.id,
      message.sender_id,
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
  left join lateral (
    select pg_catalog.count(*)::integer as unread_count
    from public.messages unread_message
    where unread_message.conversation_id = viewer_conversation.id
      and unread_message.sender_id <> viewer_conversation.viewer_id
      and unread_message.created_at > greatest(
        coalesce(
          viewer_conversation.last_read_at,
          timestamptz '1970-01-01 00:00:00+00'
        ),
        coalesce(
          viewer_conversation.hidden_at,
          timestamptz '1970-01-01 00:00:00+00'
        )
      )
  ) unread_state on true
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
          and draft.user_id = viewer_conversation.viewer_id
      )
    )
    and (
      eligibility.is_available
      or profile.id is null
      or profile.deletion_requested_at is not null
      or profile.deletion_scheduled_at is not null
    );
$$;

revoke all on function public.get_message_inbox_fingerprint()
from public, anon, authenticated, service_role;
grant execute on function public.get_message_inbox_fingerprint()
to authenticated;
