create table if not exists public.profile_block_events (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('blocked', 'unblocked')),
  created_at timestamptz not null default now(),
  constraint profile_block_events_not_self check (blocker_id <> blocked_profile_id)
);

alter table public.profile_block_events enable row level security;

drop policy if exists "Users can read own profile block events" on public.profile_block_events;
create policy "Users can read own profile block events"
on public.profile_block_events
for select
to authenticated
using (blocker_id = (select auth.uid()));

drop policy if exists "Users can insert own profile block events" on public.profile_block_events;
create policy "Users can insert own profile block events"
on public.profile_block_events
for insert
to authenticated
with check (blocker_id = (select auth.uid()));

create index if not exists profile_block_events_pair_action_created_idx
on public.profile_block_events (
  blocker_id,
  blocked_profile_id,
  action,
  created_at desc
);

revoke all on table public.profile_block_events from anon, authenticated;
grant select, insert
on table public.profile_block_events
to authenticated;
grant select, insert, update, delete
on table public.profile_block_events
to service_role;
