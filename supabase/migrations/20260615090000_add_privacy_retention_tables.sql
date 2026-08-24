alter table public.profiles
add column if not exists deletion_requested_at timestamptz,
add column if not exists deletion_scheduled_at timestamptz;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  email text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  scheduled_delete_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;

grant select, insert, update, delete
on table public.account_deletion_requests
to service_role;

create index if not exists account_deletion_requests_profile_id_idx
on public.account_deletion_requests(profile_id);

create index if not exists account_deletion_requests_pending_idx
on public.account_deletion_requests(scheduled_delete_at)
where status = 'pending';

create table if not exists public.retained_message_photos (
  id uuid primary key default gen_random_uuid(),
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  original_image_path text not null unique,
  image_mime_type text,
  retained_reason text not null default 'sender_deleted_photo_safety_retention',
  retained_until timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now()
);

alter table public.retained_message_photos enable row level security;

grant select, insert, update, delete
on table public.retained_message_photos
to service_role;

create index if not exists retained_message_photos_retained_until_idx
on public.retained_message_photos(retained_until);

create index if not exists retained_message_photos_sender_id_idx
on public.retained_message_photos(sender_id);

drop policy if exists "Conversation participants can view message photo files"
on storage.objects;

drop policy if exists "Message senders can delete their own message photo files"
on storage.objects;

create policy "Conversation participants can view message photo files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-photos'
  and exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.image_path = storage.objects.name
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
);
