alter table public.conversations enable row level security;

drop policy if exists "Users can create their own conversations" on public.conversations;

create policy "Users can create their own conversations"
on public.conversations
for insert
with check (
  auth.uid() = family_id
  or auth.uid() = au_pair_id
);
