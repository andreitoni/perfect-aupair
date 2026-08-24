create table if not exists public.conversation_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.conversation_reads enable row level security;

drop policy if exists "Users can view own conversation reads" on public.conversation_reads;
drop policy if exists "Users can manage own conversation reads" on public.conversation_reads;

create policy "Users can view own conversation reads"
on public.conversation_reads
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can manage own conversation reads"
on public.conversation_reads
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.is_conversation_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_column record;
  v_exists boolean;
begin
  if p_conversation_id is null or p_user_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.sender_id = p_user_id
  )
  into v_exists;

  if v_exists then
    return true;
  end if;

  for v_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and udt_name = 'uuid'
      and column_name <> 'id'
  loop
    execute format(
      'select exists (select 1 from public.conversations where id = $1 and %I = $2)',
      v_column.column_name
    )
    into v_exists
    using p_conversation_id, p_user_id;

    if v_exists then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
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
    return;
  end if;

  insert into public.conversation_reads (
    user_id,
    conversation_id,
    last_read_at
  )
  values (
    v_user_id,
    p_conversation_id,
    now()
  )
  on conflict (user_id, conversation_id)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

create or replace function public.get_unread_sender_count()
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

  select count(distinct m.sender_id)::integer
  into v_count
  from public.messages m
  left join public.conversation_reads r
    on r.user_id = v_user_id
   and r.conversation_id = m.conversation_id
  where m.sender_id <> v_user_id
    and m.created_at > coalesce(r.last_read_at, '1970-01-01'::timestamptz)
    and public.is_conversation_member(m.conversation_id, v_user_id);

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_unread_sender_count() to authenticated;
