create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  constraint profile_reports_no_self_report check (reporter_id <> reported_profile_id),
  constraint profile_reports_reason_valid check (
    reason in (
      'fake_profile',
      'inappropriate_content',
      'spam',
      'unsafe_behavior',
      'other'
    )
  )
);

alter table public.profile_reports enable row level security;

drop policy if exists "Users can create profile reports" on public.profile_reports;
drop policy if exists "Users can view their own reports" on public.profile_reports;

create policy "Users can create profile reports"
on public.profile_reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and reporter_id <> reported_profile_id
);

create policy "Users can view their own reports"
on public.profile_reports
for select
to authenticated
using (reporter_id = (select auth.uid()));
