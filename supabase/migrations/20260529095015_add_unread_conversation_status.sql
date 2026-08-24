create or replace function public.has_unread_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_has_unread boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return false;
  end if;

  if not public.is_conversation_member(p_conversation_id, v_user_id) then
    return false;
  end if;

  select exists (
    select 1
    from public.messages m
    left join public.conversation_reads r
      on r.user_id = v_user_id
     and r.conversation_id = m.conversation_id
    where m.conversation_id = p_conversation_id
      and m.sender_id <> v_user_id
      and m.created_at > coalesce(r.last_read_at, '1970-01-01'::timestamptz)
  )
  into v_has_unread;

  return coalesce(v_has_unread, false);
end;
$$;

grant execute on function public.has_unread_conversation(uuid) to authenticated;
