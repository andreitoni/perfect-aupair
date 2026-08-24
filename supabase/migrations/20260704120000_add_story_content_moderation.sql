alter table public.profile_stories
add column if not exists content_moderation_status text not null default 'pending',
add column if not exists content_moderation_reviewed_at timestamptz,
add column if not exists content_moderation_reviewed_by uuid references public.profiles(id) on delete set null,
add column if not exists content_moderation_reason text;

alter table public.profile_stories
drop constraint if exists profile_stories_content_moderation_status_valid;

alter table public.profile_stories
add constraint profile_stories_content_moderation_status_valid
check (content_moderation_status in ('pending', 'approved', 'rejected'));

create index if not exists profile_stories_content_moderation_status_idx
on public.profile_stories (content_moderation_status, expires_at, created_at desc);

update public.profile_stories
set
  content_moderation_status = 'approved',
  content_moderation_reviewed_at = coalesce(content_moderation_reviewed_at, now()),
  content_moderation_reason = coalesce(
    content_moderation_reason,
    'Existing story approved during content moderation rollout.'
  )
where content_moderation_status = 'pending';

drop policy if exists "Anyone can view active profile stories"
on public.profile_stories;

drop policy if exists "Users can view moderated active profile stories"
on public.profile_stories;

create policy "Users can view moderated active profile stories"
on public.profile_stories
for select
to anon, authenticated
using (
  expires_at > now()
  and (
    content_moderation_status = 'approved'
    or profile_id = (select auth.uid())
  )
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
    s.created_at,
    s.expires_at
  from public.profile_stories s
  join public.profiles p
    on p.id = s.profile_id
  where s.expires_at > now()
    and s.content_moderation_status = 'approved'
    and p.onboarding_completed = true
    and p.suspended_at is null
    and p.content_moderation_status = 'approved'
    and coalesce(p.is_admin, false) = false
    and exists (
      select 1
      from public.profile_photos ph
      where ph.profile_id = p.id
    )
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
    s.created_at,
    s.expires_at
  from public.profile_stories s
  join public.profiles p
    on p.id = s.profile_id
  where s.id = p_story_id
    and s.expires_at > now()
    and s.content_moderation_status = 'approved'
    and p.onboarding_completed = true
    and p.suspended_at is null
    and p.content_moderation_status = 'approved'
    and coalesce(p.is_admin, false) = false
    and exists (
      select 1
      from public.profile_photos ph
      where ph.profile_id = p.id
    )
  limit 1;
$$;

grant execute on function public.get_active_story_cards(text) to anon, authenticated;
grant execute on function public.get_public_story(uuid) to anon, authenticated;
