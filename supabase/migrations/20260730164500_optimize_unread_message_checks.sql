-- The navigation badge polls this function while authenticated pages are open.
-- The previous implementation called is_conversation_member() once per
-- candidate message. That helper inspected information_schema and executed
-- dynamic SQL for every call, which produced millions of conversation scans.
--
-- Conversation ownership is explicit and immutable in family_id / au_pair_id,
-- including after profile deletion, so use those indexed columns directly.
create or replace function public.is_conversation_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    p_conversation_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from public.conversations conversation
      where conversation.id = p_conversation_id
        and (
          conversation.family_id = p_user_id
          or conversation.au_pair_id = p_user_id
        )
    );
$$;

create index if not exists messages_conversation_created_at_idx
on public.messages (conversation_id, created_at desc)
include (sender_id);

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
  select coalesce(count(distinct message.sender_id), 0)::integer
  from viewer
  join participant_conversations participant on true
  join public.messages message
    on message.conversation_id = participant.id
  left join public.conversation_reads read_state
    on read_state.user_id = viewer.id
   and read_state.conversation_id = participant.id
  where message.sender_id <> viewer.id
    and message.created_at > coalesce(
      read_state.last_read_at,
      '1970-01-01'::timestamptz
    );
$$;

revoke all on function public.is_conversation_member(uuid, uuid)
from public, anon;
grant execute on function public.is_conversation_member(uuid, uuid)
to authenticated, service_role;

revoke all on function public.get_unread_sender_count()
from public, anon;
grant execute on function public.get_unread_sender_count()
to authenticated;
