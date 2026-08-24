create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles(id) on delete cascade,
  au_pair_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_different_users check (family_id <> au_pair_id),
  constraint conversations_unique_pair unique (family_id, au_pair_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Conversation participants can view conversations"
on public.conversations
for select
to authenticated
using (
  (select auth.uid()) = family_id
  or (select auth.uid()) = au_pair_id
);

create policy "Conversation participants can update conversations"
on public.conversations
for update
to authenticated
using (
  (select auth.uid()) = family_id
  or (select auth.uid()) = au_pair_id
)
with check (
  (select auth.uid()) = family_id
  or (select auth.uid()) = au_pair_id
);

create policy "Conversation participants can view messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
);

create policy "Conversation participants can send messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
);

create or replace function public.create_or_get_conversation(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile_id uuid := (select auth.uid());
  current_type text;
  target_type text;
  v_family_id uuid;
  v_au_pair_id uuid;
  v_conversation_id uuid;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_profile_id = current_profile_id then
    raise exception 'You cannot message yourself';
  end if;

  select account_type
  into current_type
  from public.profiles
  where id = current_profile_id
    and onboarding_completed = true;

  select account_type
  into target_type
  from public.profiles
  where id = p_profile_id
    and onboarding_completed = true;

  if current_type is null then
    raise exception 'Your profile is not complete';
  end if;

  if target_type is null then
    raise exception 'Target profile is not available';
  end if;

  if current_type = target_type then
    raise exception 'You can only message the opposite account type';
  end if;

  if current_type = 'family' and target_type = 'au_pair' then
    v_family_id := current_profile_id;
    v_au_pair_id := p_profile_id;
  elsif current_type = 'au_pair' and target_type = 'family' then
    v_family_id := p_profile_id;
    v_au_pair_id := current_profile_id;
  else
    raise exception 'Invalid account types';
  end if;

  insert into public.conversations (family_id, au_pair_id)
  values (v_family_id, v_au_pair_id)
  on conflict (family_id, au_pair_id)
  do update set updated_at = now()
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

grant execute on function public.create_or_get_conversation(uuid) to authenticated;
