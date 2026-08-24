create or replace function public.get_unread_message_count_for_conversation(
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 0;
  end if;

  if not public.is_conversation_member(p_conversation_id, v_user_id) then
    return 0;
  end if;

  select count(*)::integer
  into v_count
  from public.messages m
  left join public.conversation_reads r
    on r.user_id = v_user_id
   and r.conversation_id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and m.sender_id <> v_user_id
    and m.created_at > coalesce(r.last_read_at, '1970-01-01'::timestamptz);

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.get_unread_message_count_for_conversation(uuid) to authenticated;
