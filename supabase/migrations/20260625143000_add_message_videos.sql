insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'message-videos',
  'message-videos',
  false,
  104857600,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.messages
add column if not exists video_path text,
add column if not exists video_mime_type text,
add column if not exists video_size_bytes bigint,
add column if not exists video_duration_seconds numeric(6, 2);

alter table public.messages
drop constraint if exists messages_content_check;

alter table public.messages
add constraint messages_content_check
check (
  (char_length(body) between 1 and 1000)
  or image_path is not null
  or video_path is not null
);

alter table public.messages
drop constraint if exists messages_single_attachment_check;

alter table public.messages
add constraint messages_single_attachment_check
check (
  not (image_path is not null and video_path is not null)
);

alter table public.messages
drop constraint if exists messages_video_metadata_check;

alter table public.messages
add constraint messages_video_metadata_check
check (
  (
    video_path is null
    and video_mime_type is null
    and video_size_bytes is null
    and video_duration_seconds is null
  )
  or (
    video_path is not null
    and video_mime_type in ('video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v')
    and video_size_bytes > 0
    and video_size_bytes <= 104857600
    and video_duration_seconds > 0
    and video_duration_seconds <= 60.5
  )
);

create unique index if not exists messages_video_path_unique_idx
on public.messages(video_path)
where video_path is not null;

create table if not exists public.retained_message_videos (
  id uuid primary key default gen_random_uuid(),
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  original_video_path text not null unique,
  video_mime_type text,
  video_size_bytes bigint,
  video_duration_seconds numeric(6, 2),
  retained_reason text not null default 'sender_deleted_video_moderation_retention',
  retained_until timestamptz not null default (now() + interval '3 days'),
  created_at timestamptz not null default now(),
  constraint retained_message_videos_mime_type_valid check (
    video_mime_type is null
    or video_mime_type in ('video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v')
  ),
  constraint retained_message_videos_size_valid check (
    video_size_bytes is null
    or (video_size_bytes > 0 and video_size_bytes <= 104857600)
  ),
  constraint retained_message_videos_duration_valid check (
    video_duration_seconds is null
    or (video_duration_seconds > 0 and video_duration_seconds <= 60.5)
  )
);

alter table public.retained_message_videos enable row level security;

grant select, insert, update, delete
on table public.retained_message_videos
to service_role;

create index if not exists retained_message_videos_retained_until_idx
on public.retained_message_videos(retained_until);

create index if not exists retained_message_videos_sender_id_idx
on public.retained_message_videos(sender_id);

create or replace function public.message_video_storage_object_is_retained(
  p_storage_path text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.retained_message_videos rmv
    where rmv.original_video_path = p_storage_path
  );
$$;

revoke all on function public.message_video_storage_object_is_retained(text)
from public;

grant execute on function public.message_video_storage_object_is_retained(text)
to authenticated, service_role;

drop policy if exists "Conversation participants can view message video files"
on storage.objects;

create policy "Conversation participants can view message video files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-videos'
  and exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.video_path = storage.objects.name
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
);

drop policy if exists "Conversation participants can upload message video files"
on storage.objects;

create policy "Conversation participants can upload message video files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-videos'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
);

drop policy if exists "Conversation participants can delete orphan message video files"
on storage.objects;

create policy "Conversation participants can delete orphan message video files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-videos'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
  and not exists (
    select 1
    from public.messages m
    where m.video_path = storage.objects.name
  )
  and not public.message_video_storage_object_is_retained(storage.objects.name)
);

drop function if exists public.get_message_inbox_cards();

create function public.get_message_inbox_cards()
returns table (
  conversation_id uuid,
  family_id uuid,
  au_pair_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  activity_at timestamptz,
  other_profile_id uuid,
  other_account_type text,
  other_public_slug text,
  other_full_name text,
  other_country text,
  other_city text,
  other_primary_photo_path text,
  other_activity_status text,
  other_verification_status text,
  last_message_body text,
  last_message_image_path text,
  last_message_image_mime_type text,
  last_message_video_path text,
  last_message_video_mime_type text,
  last_message_created_at timestamptz,
  unread_count integer
)
language sql
security definer
set search_path = public
as $$
  with viewer_conversations as (
    select
      c.id,
      c.family_id,
      c.au_pair_id,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      coalesce(c.last_message_at, c.updated_at, c.created_at) as activity_at,
      cr.hidden_at
    from public.conversations c
    left join public.conversation_reads cr
      on cr.user_id = auth.uid()
     and cr.conversation_id = c.id
    where auth.uid() is not null
      and (
        c.family_id = auth.uid()
        or c.au_pair_id = auth.uid()
      )
  )
  select
    vc.id as conversation_id,
    vc.family_id,
    vc.au_pair_id,
    vc.created_at,
    vc.updated_at,
    vc.last_message_at,
    vc.activity_at,
    p.id as other_profile_id,
    p.account_type as other_account_type,
    p.public_slug as other_public_slug,
    p.full_name as other_full_name,
    p.country as other_country,
    p.city as other_city,
    primary_photo.storage_path as other_primary_photo_path,
    public.profile_activity_status(p.last_active_at) as other_activity_status,
    p.verification_status as other_verification_status,
    last_message.body as last_message_body,
    last_message.image_path as last_message_image_path,
    last_message.image_mime_type as last_message_image_mime_type,
    last_message.video_path as last_message_video_path,
    last_message.video_mime_type as last_message_video_mime_type,
    last_message.created_at as last_message_created_at,
    (
      select count(*)::integer
      from public.messages unread_message
      left join public.conversation_reads unread_read
        on unread_read.user_id = auth.uid()
       and unread_read.conversation_id = unread_message.conversation_id
      where unread_message.conversation_id = vc.id
        and unread_message.sender_id <> auth.uid()
        and unread_message.created_at > coalesce(
          unread_read.last_read_at,
          '1970-01-01'::timestamptz
        )
    ) as unread_count
  from viewer_conversations vc
  join public.profiles p
    on p.id = case
      when vc.family_id = auth.uid() then vc.au_pair_id
      else vc.family_id
    end
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  left join lateral (
    select
      body,
      image_path,
      image_mime_type,
      video_path,
      video_mime_type,
      created_at
    from public.messages
    where conversation_id = vc.id
    order by created_at desc
    limit 1
  ) last_message on true
  where (vc.hidden_at is null or vc.activity_at > vc.hidden_at)
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  order by vc.activity_at desc;
$$;

grant execute on function public.get_message_inbox_cards() to authenticated;
