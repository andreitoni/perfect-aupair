create or replace function public.validate_conversation_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_type text;
  v_au_pair_type text;
begin
  if new.family_id is null or new.au_pair_id is null then
    raise exception 'Conversation participants are required';
  end if;

  if new.family_id = new.au_pair_id then
    raise exception 'Users cannot create a conversation with themselves';
  end if;

  select account_type
  into v_family_type
  from public.profiles
  where id = new.family_id;

  select account_type
  into v_au_pair_type
  from public.profiles
  where id = new.au_pair_id;

  if v_family_type is distinct from 'family' then
    raise exception 'family_id must belong to a family profile';
  end if;

  if v_au_pair_type is distinct from 'au_pair' then
    raise exception 'au_pair_id must belong to an au pair profile';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_conversation_participants_trigger on public.conversations;

create trigger validate_conversation_participants_trigger
before insert or update of family_id, au_pair_id on public.conversations
for each row
execute function public.validate_conversation_participants();

create or replace function public.validate_message_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_au_pair_id uuid;
begin
  if new.conversation_id is null or new.sender_id is null then
    raise exception 'Message conversation and sender are required';
  end if;

  select family_id, au_pair_id
  into v_family_id, v_au_pair_id
  from public.conversations
  where id = new.conversation_id;

  if v_family_id is null or v_au_pair_id is null then
    raise exception 'Conversation not found';
  end if;

  if new.sender_id <> v_family_id and new.sender_id <> v_au_pair_id then
    raise exception 'Message sender must be part of the conversation';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_message_sender_trigger on public.messages;

create trigger validate_message_sender_trigger
before insert or update of conversation_id, sender_id on public.messages
for each row
execute function public.validate_message_sender();

create unique index if not exists conversations_family_au_pair_unique_idx
on public.conversations (family_id, au_pair_id);
