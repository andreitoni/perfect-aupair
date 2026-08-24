drop policy if exists "Users can manage own profile blocks" on public.profile_blocks;
drop policy if exists "Users can read own profile blocks" on public.profile_blocks;
create policy "Users can read own profile blocks"
on public.profile_blocks
for select
to authenticated
using (blocker_id = (select auth.uid()));

drop policy if exists "Users can insert own profile block events" on public.profile_block_events;

revoke all on table public.profile_blocks from anon, authenticated;
grant select
on table public.profile_blocks
to authenticated;
grant select, insert, update, delete
on table public.profile_blocks
to service_role;

revoke all on table public.profile_block_events from anon, authenticated;
grant select
on table public.profile_block_events
to authenticated;
grant select, insert, update, delete
on table public.profile_block_events
to service_role;

create or replace function public.block_profile(p_blocked_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile_id uuid := (select auth.uid());
  recent_unblock_at timestamptz;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_blocked_profile_id is null or p_blocked_profile_id = current_profile_id then
    raise exception 'Invalid profile';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_blocked_profile_id
  ) then
    raise exception 'Profile not found';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where (
      c.family_id = current_profile_id
      and c.au_pair_id = p_blocked_profile_id
    ) or (
      c.au_pair_id = current_profile_id
      and c.family_id = p_blocked_profile_id
    )
  ) then
    raise exception 'Conversation not found';
  end if;

  select e.created_at
  into recent_unblock_at
  from public.profile_block_events e
  where e.blocker_id = current_profile_id
    and e.blocked_profile_id = p_blocked_profile_id
    and e.action = 'unblocked'
    and e.created_at >= now() - interval '48 hours'
  order by e.created_at desc
  limit 1;

  if recent_unblock_at is not null then
    return jsonb_build_object(
      'ok',
      false,
      'error_code',
      'block_cooldown',
      'retry_at',
      recent_unblock_at + interval '48 hours'
    );
  end if;

  insert into public.profile_blocks (
    blocker_id,
    blocked_profile_id
  )
  values (
    current_profile_id,
    p_blocked_profile_id
  )
  on conflict (blocker_id, blocked_profile_id) do nothing;

  insert into public.profile_block_events (
    blocker_id,
    blocked_profile_id,
    action
  )
  values (
    current_profile_id,
    p_blocked_profile_id,
    'blocked'
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unblock_profile(p_blocked_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile_id uuid := (select auth.uid());
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_blocked_profile_id is null or p_blocked_profile_id = current_profile_id then
    raise exception 'Invalid profile';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_blocked_profile_id
  ) then
    raise exception 'Profile not found';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where (
      c.family_id = current_profile_id
      and c.au_pair_id = p_blocked_profile_id
    ) or (
      c.au_pair_id = current_profile_id
      and c.family_id = p_blocked_profile_id
    )
  ) and not exists (
    select 1
    from public.profile_blocks b
    where b.blocker_id = current_profile_id
      and b.blocked_profile_id = p_blocked_profile_id
  ) then
    raise exception 'Conversation not found';
  end if;

  delete from public.profile_blocks b
  where b.blocker_id = current_profile_id
    and b.blocked_profile_id = p_blocked_profile_id;

  insert into public.profile_block_events (
    blocker_id,
    blocked_profile_id,
    action
  )
  values (
    current_profile_id,
    p_blocked_profile_id,
    'unblocked'
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.block_profile(uuid) from public, anon;
revoke all on function public.unblock_profile(uuid) from public, anon;
grant execute on function public.block_profile(uuid) to authenticated;
grant execute on function public.unblock_profile(uuid) to authenticated;
