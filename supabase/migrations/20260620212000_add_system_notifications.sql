create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 1200),
  image_url text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.system_notifications enable row level security;

drop policy if exists "Users can read own system notifications" on public.system_notifications;
create policy "Users can read own system notifications"
on public.system_notifications
for select
to authenticated
using (recipient_id = (select auth.uid()));

create index if not exists system_notifications_recipient_created_idx
on public.system_notifications (recipient_id, created_at desc);

grant select on public.system_notifications to authenticated;
grant all on public.system_notifications to service_role;
