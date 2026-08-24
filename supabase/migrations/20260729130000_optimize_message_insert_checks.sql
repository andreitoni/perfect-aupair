-- Message inserts run recent sender rate-limit and new-account risk checks.
-- Keep those bounded as the messages table grows and cover the distinct
-- conversation risk check without returning to the heap for every row.
create index if not exists messages_sender_recent_idx
on public.messages (sender_id, created_at desc)
include (conversation_id);
