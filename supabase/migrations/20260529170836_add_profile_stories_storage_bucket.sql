insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-stories',
  'profile-stories',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view profile story files" on storage.objects;
drop policy if exists "Users can upload own profile story files" on storage.objects;
drop policy if exists "Users can update own profile story files" on storage.objects;
drop policy if exists "Users can delete own profile story files" on storage.objects;

create policy "Anyone can view profile story files"
on storage.objects
for select
using (bucket_id = 'profile-stories');

create policy "Users can upload own profile story files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own profile story files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own profile story files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = auth.uid()::text
);
