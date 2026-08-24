-- Typing state is ephemeral and travels through a private Realtime Broadcast
-- channel. Reuse the message-send eligibility check so only the two active,
-- unblocked conversation participants can join and publish.

drop policy if exists "Conversation participants can receive typing broadcasts"
on realtime.messages;

create policy "Conversation participants can receive typing broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and public.message_send_is_allowed(
    case
      when (select realtime.topic()) ~*
        '^conversation-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.split_part((select realtime.topic()), ':', 2)::uuid
      else null
    end,
    (select auth.uid())
  )
);

drop policy if exists "Conversation participants can send typing broadcasts"
on realtime.messages;

create policy "Conversation participants can send typing broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and public.message_send_is_allowed(
    case
      when (select realtime.topic()) ~*
        '^conversation-typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.split_part((select realtime.topic()), ':', 2)::uuid
      else null
    end,
    (select auth.uid())
  )
);
