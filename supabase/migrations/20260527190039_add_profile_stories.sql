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

create table public.profile_stories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 160),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);

alter table public.profile_stories enable row level security;

create policy "Anyone can view active profile stories"
on public.profile_stories
for select
to anon, authenticated
using (expires_at > now());

create policy "Users can insert their own profile stories"
on public.profile_stories
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.onboarding_completed = true
  )
);

create policy "Users can delete their own profile stories"
on public.profile_stories
for delete
to authenticated
using (profile_id = (select auth.uid()));

create policy "Anyone can view profile story files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'profile-stories');

create policy "Users can upload their own profile story files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own profile story files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.get_active_story_cards(p_account_type text)
returns table (
  id uuid,
  profile_id uuid,
  full_name text,
  account_type text,
  city text,
  country text,
  storage_path text,
  caption text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    p.id as profile_id,
    p.full_name,
    p.account_type,
    p.city,
    p.country,
    s.storage_path,
    s.caption,
    s.created_at,
    s.expires_at
  from public.profile_stories s
  join public.profiles p
    on p.id = s.profile_id
  where s.expires_at > now()
    and p.onboarding_completed = true
    and p.account_type = p_account_type
  order by s.created_at desc
  limit 20;
$$;

create or replace function public.get_public_story(p_story_id uuid)
returns table (
  id uuid,
  profile_id uuid,
  full_name text,
  account_type text,
  city text,
  country text,
  storage_path text,
  caption text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    p.id as profile_id,
    p.full_name,
    p.account_type,
    p.city,
    p.country,
    s.storage_path,
    s.caption,
    s.created_at,
    s.expires_at
  from public.profile_stories s
  join public.profiles p
    on p.id = s.profile_id
  where s.id = p_story_id
    and s.expires_at > now()
    and p.onboarding_completed = true
  limit 1;
$$;

grant execute on function public.get_active_story_cards(text) to anon, authenticated;
grant execute on function public.get_public_story(uuid) to anon, authenticated;
