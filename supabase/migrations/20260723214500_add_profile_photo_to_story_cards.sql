-- Story rails use the account's primary profile photo as their avatar. Keep
-- the actual story Storage path hidden from guests.
drop function if exists public.get_bounded_public_story_cards(text, uuid);

create function public.get_bounded_public_story_cards(
  p_account_type text,
  p_viewer_id uuid default null
)
returns table (
  id uuid,
  profile_id uuid,
  full_name text,
  account_type text,
  city text,
  country text,
  primary_photo_path text,
  storage_path text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '2s'
set lock_timeout = '250ms'
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_account_type not in ('family', 'au_pair') then
    return;
  end if;

  return query
  with viewer as materialized (
    select
      profile.id,
      profile.account_type,
      coalesce(profile.is_admin, false) as is_admin
    from public.profiles profile
    where p_viewer_id is not null
      and profile.id = p_viewer_id
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.deletion_scheduled_at is null
      and (
        coalesce(profile.is_admin, false)
        or public.public_profile_is_eligible(profile.id, true)
      )
    limit 1
  )
  select
    story.id,
    owner_profile.id,
    owner_profile.full_name,
    owner_profile.account_type,
    owner_profile.city,
    owner_profile.country,
    primary_photo.storage_path,
    case when p_viewer_id is null then null else story.storage_path end,
    story.created_at,
    story.expires_at
  from public.profile_stories story
  join public.profiles owner_profile on owner_profile.id = story.profile_id
  cross join lateral (
    select photo.storage_path
    from public.profile_photos photo
    where photo.profile_id = owner_profile.id
    order by
      photo.is_primary desc,
      photo.sort_order asc,
      photo.created_at asc,
      photo.id asc
    limit 1
  ) primary_photo
  where public.database_feature_flag_enabled('stories')
    and owner_profile.account_type = p_account_type
    and story.expires_at > clock_timestamp()
    and story.content_moderation_status = 'approved'
    and public.public_profile_is_eligible(owner_profile.id, true)
    and (
      p_viewer_id is null
      or exists (
        select 1
        from viewer
        where (
          viewer.is_admin
          or viewer.account_type <> owner_profile.account_type
        )
          and not exists (
            select 1
            from public.profile_blocks block
            where (
              block.blocker_id = viewer.id
              and block.blocked_profile_id = owner_profile.id
            ) or (
              block.blocker_id = owner_profile.id
              and block.blocked_profile_id = viewer.id
            )
          )
      )
    )
  order by story.created_at desc, story.id desc
  limit 20;
end;
$$;

revoke all on function public.get_bounded_public_story_cards(text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_bounded_public_story_cards(text, uuid)
to service_role;
