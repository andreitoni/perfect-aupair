alter table public.system_notifications
add column if not exists actor_profile_id uuid references public.profiles(id) on delete cascade;

create index if not exists system_notifications_profile_view_actor_idx
on public.system_notifications (recipient_id, type, actor_profile_id, created_at desc)
where actor_profile_id is not null;
