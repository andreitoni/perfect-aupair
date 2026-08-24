-- Keep profile visibility and the required-photo flow consistent when an
-- administrator removes a profile photo during moderation.

create or replace function public.delete_profile_photo_for_moderation(
  p_photo_id uuid,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_storage_path text;
  v_was_primary boolean;
  v_remaining_photos integer;
  v_next_photo_id uuid;
  v_public_slug text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_photo_id is null
    or p_reviewer_id is null
    or not exists (
      select 1
      from public.profiles reviewer
      where reviewer.id = p_reviewer_id
        and coalesce(reviewer.is_admin, false) = true
    )
  then
    raise exception 'A valid administrator is required'
      using errcode = '42501';
  end if;

  select photo.profile_id
  into v_profile_id
  from public.profile_photos photo
  where photo.id = p_photo_id;

  if v_profile_id is null then
    return null;
  end if;

  -- Profile text changes, photo mutations, and moderation decisions use this
  -- same row lock, so the delete cannot race an approval or another upload.
  select profile.public_slug
  into v_public_slug
  from public.profiles profile
  where profile.id = v_profile_id
    and coalesce(profile.is_admin, false) = false
  for update;

  if not found then
    raise exception 'Admin profiles cannot be moderated from this dashboard'
      using errcode = '42501';
  end if;

  select photo.storage_path, photo.is_primary
  into v_storage_path, v_was_primary
  from public.profile_photos photo
  where photo.id = p_photo_id
    and photo.profile_id = v_profile_id
  for update;

  if not found then
    return null;
  end if;

  delete from public.profile_photos
  where id = p_photo_id;

  select count(*)::integer
  into v_remaining_photos
  from public.profile_photos photo
  where photo.profile_id = v_profile_id;

  if v_remaining_photos = 0 then
    update public.profiles
    set
      content_moderation_status = 'pending',
      content_moderation_reviewed_at = null,
      content_moderation_reviewed_by = null,
      content_moderation_reason =
        'The last profile photo was removed during moderation. A new photo is required and must be reviewed.'
    where id = v_profile_id;
  elsif v_was_primary then
    select photo.id
    into v_next_photo_id
    from public.profile_photos photo
    where photo.profile_id = v_profile_id
    order by photo.sort_order asc, photo.created_at asc, photo.id asc
    limit 1;

    update public.profile_photos
    set is_primary = true
    where id = v_next_photo_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'profile_id', v_profile_id,
    'storage_path', v_storage_path,
    'was_primary', v_was_primary,
    'remaining_photos', v_remaining_photos,
    'public_slug', v_public_slug
  );
end;
$$;

revoke all on function public.delete_profile_photo_for_moderation(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.delete_profile_photo_for_moderation(uuid, uuid)
to service_role;
