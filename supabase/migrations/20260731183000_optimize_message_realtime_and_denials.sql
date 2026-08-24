-- Move conversation refreshes from Postgres Changes to a private, minimal
-- Broadcast payload. Also collapse the fallback poll into one RPC and keep
-- fixed-cardinality, non-identifying counters for app message-send denials.

create table if not exists public.message_send_denial_counters (
  reason text primary key,
  denial_count bigint not null default 0 check (denial_count >= 0),
  last_denied_at timestamptz,
  constraint message_send_denial_counters_reason_check check (
    reason in (
      'not_authenticated',
      'invalid_conversation',
      'feature_disabled',
      'blocked',
      'sender_unavailable',
      'recipient_unavailable',
      'conflict'
    )
  )
);

insert into public.message_send_denial_counters (reason)
values
  ('not_authenticated'),
  ('invalid_conversation'),
  ('feature_disabled'),
  ('blocked'),
  ('sender_unavailable'),
  ('recipient_unavailable'),
  ('conflict')
on conflict (reason) do nothing;

alter table public.message_send_denial_counters enable row level security;
revoke all on table public.message_send_denial_counters
from public, anon, authenticated;
grant select on table public.message_send_denial_counters to service_role;

create or replace function public.message_send_eligibility_reason_internal(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_authenticated_id uuid := (select auth.uid());
  v_conversation public.conversations%rowtype;
  v_recipient_id uuid;
begin
  if v_authenticated_id is null or p_sender_id is null
    or p_sender_id <> v_authenticated_id
  then
    return 'not_authenticated';
  end if;

  select conversation.* into v_conversation
  from public.conversations conversation
  where conversation.id = p_conversation_id;

  if not found or p_sender_id not in (
    v_conversation.family_id,
    v_conversation.au_pair_id
  ) then
    return 'invalid_conversation';
  end if;

  if not public.database_feature_flag_enabled('message_send') then
    return 'feature_disabled';
  end if;

  if public.profile_pair_blocked_internal(
    v_conversation.family_id,
    v_conversation.au_pair_id
  ) then
    return 'blocked';
  end if;

  if not public.messaging_profile_is_eligible(p_sender_id) then
    return 'sender_unavailable';
  end if;

  v_recipient_id := case
    when p_sender_id = v_conversation.family_id
      then v_conversation.au_pair_id
    else v_conversation.family_id
  end;

  if not public.messaging_profile_is_eligible(v_recipient_id) then
    return 'recipient_unavailable';
  end if;

  return 'allowed';
end;
$$;

revoke all on function public.message_send_eligibility_reason_internal(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.record_message_send_denial_internal(
  p_reason text
)
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  update public.message_send_denial_counters counter
  set
    denial_count = counter.denial_count + 1,
    last_denied_at = pg_catalog.clock_timestamp()
  where counter.reason = p_reason;
end;
$$;

revoke all on function public.record_message_send_denial_internal(text)
from public, anon, authenticated, service_role;

create or replace function public.get_message_send_eligibility(
  p_conversation_id uuid
)
returns text
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_reason text;
begin
  v_reason := public.message_send_eligibility_reason_internal(
    p_conversation_id,
    (select auth.uid())
  );

  if v_reason <> 'allowed' then
    perform public.record_message_send_denial_internal(v_reason);
  end if;

  return v_reason;
end;
$$;

revoke all on function public.get_message_send_eligibility(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_message_send_eligibility(uuid)
to authenticated;

create or replace function public.send_message_if_allowed(
  p_message_id uuid,
  p_conversation_id uuid,
  p_body text,
  p_image_path text,
  p_image_mime_type text,
  p_video_path text,
  p_video_mime_type text,
  p_video_size_bytes bigint,
  p_video_duration_seconds numeric,
  p_audio_path text,
  p_audio_mime_type text,
  p_audio_size_bytes bigint,
  p_audio_duration_seconds numeric
)
returns text
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_sender_id uuid := (select auth.uid());
  v_reason text;
  v_inserted_id uuid;
begin
  v_reason := public.message_send_eligibility_reason_internal(
    p_conversation_id,
    v_sender_id
  );

  if v_reason <> 'allowed' then
    perform public.record_message_send_denial_internal(v_reason);
    return v_reason;
  end if;

  insert into public.messages (
    id,
    conversation_id,
    sender_id,
    body,
    image_path,
    image_mime_type,
    video_path,
    video_mime_type,
    video_size_bytes,
    video_duration_seconds,
    audio_path,
    audio_mime_type,
    audio_size_bytes,
    audio_duration_seconds
  ) values (
    p_message_id,
    p_conversation_id,
    v_sender_id,
    p_body,
    p_image_path,
    p_image_mime_type,
    p_video_path,
    p_video_mime_type,
    p_video_size_bytes,
    p_video_duration_seconds,
    p_audio_path,
    p_audio_mime_type,
    p_audio_size_bytes,
    p_audio_duration_seconds
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    return 'sent';
  end if;

  if exists (
    select 1
    from public.messages message
    where message.id = p_message_id
      and message.conversation_id = p_conversation_id
      and message.sender_id = v_sender_id
  ) then
    return 'already_sent';
  end if;

  perform public.record_message_send_denial_internal('conflict');
  return 'conflict';
end;
$$;

revoke all on function public.send_message_if_allowed(
  uuid, uuid, text, text, text, text, text, bigint, numeric,
  text, text, bigint, numeric
)
from public, anon, authenticated, service_role;
grant execute on function public.send_message_if_allowed(
  uuid, uuid, text, text, text, text, text, bigint, numeric,
  text, text, bigint, numeric
)
to authenticated;

create or replace function public.get_message_conversation_fingerprint(
  p_conversation_id uuid,
  p_visibility_after timestamptz default null
)
returns table (
  message_count bigint,
  latest_message_at timestamptz,
  conversation_updated_at timestamptz,
  is_blocked boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    message_state.message_count,
    message_state.latest_message_at,
    conversation.updated_at,
    public.profile_pair_blocked_internal(
      conversation.family_id,
      conversation.au_pair_id
    )
  from public.conversations conversation
  cross join lateral (
    select
      pg_catalog.count(*)::bigint as message_count,
      pg_catalog.max(message.created_at) as latest_message_at
    from public.messages message
    where message.conversation_id = conversation.id
      and (
        p_visibility_after is null
        or message.created_at > p_visibility_after
      )
  ) message_state
  where conversation.id = p_conversation_id
    and (select auth.uid()) in (
      conversation.family_id,
      conversation.au_pair_id
    )
  limit 1;
$$;

revoke all on function public.get_message_conversation_fingerprint(uuid, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.get_message_conversation_fingerprint(uuid, timestamptz)
to authenticated;

-- Each profile pair has exactly one conversation, so the unread-sender badge
-- can count conversations with at least one unread counterpart message. EXISTS
-- stops on the first indexed match instead of scanning every unread message.
create or replace function public.get_unread_sender_count()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  with viewer as (
    select (select auth.uid()) as id
  ),
  participant_conversations as (
    select conversation.id
    from public.conversations conversation
    cross join viewer
    where viewer.id is not null
      and conversation.family_id = viewer.id

    union all

    select conversation.id
    from public.conversations conversation
    cross join viewer
    where viewer.id is not null
      and conversation.au_pair_id = viewer.id
  )
  select pg_catalog.count(*)::integer
  from viewer
  join participant_conversations participant on true
  left join public.conversation_reads read_state
    on read_state.user_id = viewer.id
   and read_state.conversation_id = participant.id
  where exists (
    select 1
    from public.messages message
    where message.conversation_id = participant.id
      and message.sender_id <> viewer.id
      and message.created_at > coalesce(
        read_state.last_read_at,
        timestamptz '1970-01-01 00:00:00+00'
      )
    limit 1
  );
$$;

revoke all on function public.get_unread_sender_count()
from public, anon;
grant execute on function public.get_unread_sender_count()
to authenticated;

drop policy if exists "Conversation participants can receive message broadcasts"
on realtime.messages;

create policy "Conversation participants can receive message broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~*
    '^conversation-messages:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_conversation_member(
    pg_catalog.split_part((select realtime.topic()), ':', 2)::uuid,
    (select auth.uid())
  )
);

create or replace function public.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid := coalesce(new.conversation_id, old.conversation_id);
begin
  perform realtime.send(
    pg_catalog.jsonb_build_object('conversationId', v_conversation_id),
    'changed',
    'conversation-messages:' || v_conversation_id::text,
    true
  );

  return null;
end;
$$;

revoke all on function public.broadcast_message_change()
from public, anon, authenticated, service_role;

drop trigger if exists broadcast_message_change_trigger on public.messages;
create trigger broadcast_message_change_trigger
after insert or update or delete on public.messages
for each row execute function public.broadcast_message_change();

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime drop table public.messages;
  end if;
end;
$$;
