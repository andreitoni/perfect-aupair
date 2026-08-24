create table if not exists public.profile_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_favorites_no_self_save check (user_id <> profile_id),
  constraint profile_favorites_unique unique (user_id, profile_id)
);

alter table public.profile_favorites enable row level security;

drop policy if exists "Users can view their own favorites" on public.profile_favorites;
drop policy if exists "Users can save opposite profile type" on public.profile_favorites;
drop policy if exists "Users can delete their own favorites" on public.profile_favorites;

create policy "Users can view their own favorites"
on public.profile_favorites
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can save opposite profile type"
on public.profile_favorites
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and user_id <> profile_id
  and exists (
    select 1
    from public.profiles viewer
    join public.profiles target
      on target.id = profile_favorites.profile_id
    where viewer.id = (select auth.uid())
      and viewer.onboarding_completed = true
      and target.onboarding_completed = true
      and viewer.account_type <> target.account_type
  )
);

create policy "Users can delete their own favorites"
on public.profile_favorites
for delete
to authenticated
using (user_id = (select auth.uid()));
