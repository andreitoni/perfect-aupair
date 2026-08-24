alter table public.conversations
add column if not exists last_message_at timestamptz;

update public.conversations c
set last_message_at = coalesce(
  (
    select max(m.created_at)
    from public.messages m
    where m.conversation_id = c.id
  ),
  c.created_at,
  now()
)
where c.last_message_at is null;

create or replace function public.update_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id
    and (
      last_message_at is null
      or new.created_at >= last_message_at
    );

  return new;
end;
$$;

drop trigger if exists update_conversation_last_message_at_trigger on public.messages;

create trigger update_conversation_last_message_at_trigger
after insert on public.messages
for each row
execute function public.update_conversation_last_message_at();
