insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profile_photos enable row level security;

create unique index profile_photos_one_primary_per_profile
on public.profile_photos(profile_id)
where is_primary;

create policy "Anyone can view profile photos"
on public.profile_photos
for select
to anon, authenticated
using (true);

create policy "Users can insert their own profile photos"
on public.profile_photos
for insert
to authenticated
with check ((select auth.uid()) = profile_id);

create policy "Users can update their own profile photos"
on public.profile_photos
for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy "Users can delete their own profile photos"
on public.profile_photos
for delete
to authenticated
using ((select auth.uid()) = profile_id);

create function public.enforce_profile_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.profile_photos
    where profile_id = new.profile_id
  ) >= 5 then
    raise exception 'A profile can have a maximum of 5 photos';
  end if;

  return new;
end;
$$;

create trigger profile_photos_limit_before_insert
before insert on public.profile_photos
for each row
execute function public.enforce_profile_photo_limit();

create function public.set_primary_profile_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile_id uuid;
begin
  select profile_id
  into target_profile_id
  from public.profile_photos
  where id = p_photo_id
    and profile_id = (select auth.uid());

  if target_profile_id is null then
    raise exception 'Photo not found';
  end if;

  update public.profile_photos
  set is_primary = false
  where profile_id = target_profile_id;

  update public.profile_photos
  set is_primary = true
  where id = p_photo_id
    and profile_id = target_profile_id;
end;
$$;

create policy "Anyone can view profile photo files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'profile-photos');

create policy "Users can upload their own profile photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own profile photo files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own profile photo files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
