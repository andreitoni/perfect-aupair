alter table public.profile_blocks enable row level security;

drop policy if exists "Users can manage own profile blocks" on public.profile_blocks;
create policy "Users can manage own profile blocks"
on public.profile_blocks
for all
to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

revoke all on table public.profile_blocks from anon, authenticated;
grant select, insert, delete
on table public.profile_blocks
to authenticated;
grant select, insert, update, delete
on table public.profile_blocks
to service_role;
