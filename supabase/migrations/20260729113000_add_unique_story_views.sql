-- Track one view per eligible opposite-account viewer and story. Viewer
-- identities stay private; story owners can read only the aggregate count.
create table public.profile_story_views (
  story_id uuid not null
    references public.profile_stories(id) on delete cascade,
  viewer_profile_id uuid not null
    references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (story_id, viewer_profile_id)
);

create index profile_story_views_viewer_profile_idx
on public.profile_story_views (viewer_profile_id);

alter table public.profile_story_views enable row level security;

revoke all on table public.profile_story_views
from public, anon, authenticated, service_role;
grant select, insert, update, delete
on table public.profile_story_views to service_role;

create or replace function public.record_profile_story_view(
  p_story_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_viewer_profile_id uuid := (select auth.uid());
  v_owner_profile_id uuid;
begin
  if coalesce((select auth.role()), '') <> 'authenticated'
    or v_viewer_profile_id is null
    or p_story_id is null
  then
    return;
  end if;

  select story.profile_id
  into v_owner_profile_id
  from public.profile_stories story
  join public.profiles owner_profile
    on owner_profile.id = story.profile_id
  join public.profiles viewer_profile
    on viewer_profile.id = v_viewer_profile_id
  where story.id = p_story_id
    and story.profile_id <> v_viewer_profile_id
    and story.expires_at > pg_catalog.clock_timestamp()
    and story.content_moderation_status = 'approved'
    and public.database_feature_flag_enabled('stories')
    and public.public_profile_is_eligible(owner_profile.id, true)
    and public.public_profile_is_eligible(viewer_profile.id, true)
    and owner_profile.account_type in ('family', 'au_pair')
    and viewer_profile.account_type in ('family', 'au_pair')
    and owner_profile.account_type <> viewer_profile.account_type
    and not public.profile_pair_blocked_internal(
      viewer_profile.id,
      owner_profile.id
    )
  limit 1;

  if v_owner_profile_id is null then
    return;
  end if;

  insert into public.profile_story_views (
    story_id,
    viewer_profile_id
  ) values (
    p_story_id,
    v_viewer_profile_id
  )
  on conflict (story_id, viewer_profile_id) do nothing;
end;
$$;

revoke all on function public.record_profile_story_view(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_profile_story_view(uuid)
to authenticated;

create or replace function public.get_own_profile_story_view_count(
  p_story_id uuid
)
returns bigint
language sql
security definer
stable
set search_path = ''
set statement_timeout = '2s'
as $$
  select pg_catalog.count(story_view.story_id)::bigint
  from public.profile_stories story
  join public.profile_story_views story_view
    on story_view.story_id = story.id
  where coalesce((select auth.role()), '') = 'authenticated'
    and story.id = p_story_id
    and story.profile_id = (select auth.uid())
    and story.expires_at > pg_catalog.now();
$$;

revoke all on function public.get_own_profile_story_view_count(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_own_profile_story_view_count(uuid)
to authenticated;
