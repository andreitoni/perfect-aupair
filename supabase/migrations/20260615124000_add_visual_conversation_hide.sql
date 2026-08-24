alter table public.conversation_reads
add column if not exists hidden_at timestamptz;

create or replace function public.hide_conversation_from_inbox(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_conversation_member(p_conversation_id, v_user_id) then
    raise exception 'Conversation not found';
  end if;

  insert into public.conversation_reads (
    user_id,
    conversation_id,
    last_read_at,
    hidden_at
  )
  values (
    v_user_id,
    p_conversation_id,
    now(),
    now()
  )
  on conflict (user_id, conversation_id)
  do update set
    last_read_at = excluded.last_read_at,
    hidden_at = excluded.hidden_at;
end;
$$;

grant execute on function public.hide_conversation_from_inbox(uuid) to authenticated;
