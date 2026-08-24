-- Let an authenticated viewer restore their own seen-state across sessions and
-- devices without exposing viewer identities or granting table access.
create or replace function public.get_viewed_profile_story_ids(
  p_story_ids uuid[]
)
returns setof uuid
language sql
security definer
stable
set search_path = ''
set statement_timeout = '2s'
as $$
  select story_view.story_id
  from public.profile_story_views story_view
  join public.profile_stories story
    on story.id = story_view.story_id
  where coalesce((select auth.role()), '') = 'authenticated'
    and story_view.viewer_profile_id = (select auth.uid())
    and p_story_ids is not null
    and pg_catalog.cardinality(p_story_ids) between 1 and 64
    and story_view.story_id = any(p_story_ids)
    and story.expires_at > pg_catalog.now();
$$;

revoke all on function public.get_viewed_profile_story_ids(uuid[])
from public, anon, authenticated, service_role;
grant execute on function public.get_viewed_profile_story_ids(uuid[])
to authenticated;
