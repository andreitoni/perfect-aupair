insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'message-photos',
  'message-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.messages
add column if not exists image_path text,
add column if not exists image_mime_type text;

alter table public.messages
drop constraint if exists messages_body_check;

alter table public.messages
add constraint messages_content_check
check (
  (char_length(body) between 1 and 1000)
  or image_path is not null
);

create policy "Conversation participants can view message photo files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-photos'
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

create policy "Conversation participants can upload message photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-photos'
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
