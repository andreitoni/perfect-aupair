-- A moderator decision must apply only to the exact profile/video revision
-- that was rendered in the review UI. User edits and media replacement can
-- otherwise leave the row id unchanged while changing the reviewed content.

create or replace function public.profile_content_moderation_version(
  p_profile_id uuid
)
returns text
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat(
          pg_catalog.octet_length(coalesce(profile.full_name, ''))::text,
          ':', coalesce(profile.full_name, ''),
          pg_catalog.octet_length(coalesce(profile.first_name, ''))::text,
          ':', coalesce(profile.first_name, ''),
          pg_catalog.octet_length(coalesce(profile.last_name, ''))::text,
          ':', coalesce(profile.last_name, ''),
          pg_catalog.octet_length(coalesce(profile.bio, ''))::text,
          ':', coalesce(profile.bio, ''),
          pg_catalog.octet_length(coalesce(profile.childcare_experience, ''))::text,
          ':', coalesce(profile.childcare_experience, ''),
          pg_catalog.octet_length(coalesce(profile.children_info, ''))::text,
          ':', coalesce(profile.children_info, ''),
          pg_catalog.octet_length(coalesce(profile.accommodation_info, ''))::text,
          ':', coalesce(profile.accommodation_info, ''),
          pg_catalog.octet_length(coalesce(profile.expectations, ''))::text,
          ':', coalesce(profile.expectations, ''),
          coalesce((
            select pg_catalog.string_agg(
              pg_catalog.octet_length(photo.storage_path)::text
                || ':' || photo.storage_path,
              ''
              order by pg_catalog.convert_to(photo.storage_path, 'UTF8')
            )
            from public.profile_photos photo
            where photo.profile_id = profile.id
          ), '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.profiles profile
  where profile.id = p_profile_id;
$$;

revoke all on function public.profile_content_moderation_version(uuid)
from public, anon, authenticated;
grant execute on function public.profile_content_moderation_version(uuid)
to service_role;

create or replace function public.lock_profile_photo_moderation_surface()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_ids uuid[] := '{}'::uuid[];
  v_profile_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_profile_ids := pg_catalog.array_append(v_profile_ids, old.profile_id);
  end if;
  if tg_op <> 'DELETE' then
    v_profile_ids := pg_catalog.array_append(v_profile_ids, new.profile_id);
  end if;

  for v_profile_id in
    select distinct candidate.profile_id
    from pg_catalog.unnest(v_profile_ids) as candidate(profile_id)
    where candidate.profile_id is not null
    order by candidate.profile_id
  loop
    -- Profile text updates and moderation already lock this same row. Taking
    -- the profile row here gives every content mutation one lock order.
    perform 1
    from public.profiles profile
    where profile.id = v_profile_id
    for update;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.lock_profile_photo_moderation_surface()
from public, anon, authenticated, service_role;

drop trigger if exists a0_lock_profile_photo_moderation_surface
on public.profile_photos;
create trigger a0_lock_profile_photo_moderation_surface
before insert or update of profile_id, storage_path or delete
on public.profile_photos
for each row execute function public.lock_profile_photo_moderation_surface();

-- Deleting a photo also changes the exact surface the moderator reviewed.
create or replace function public.mark_profile_photo_content_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
  v_profile_id uuid;
begin
  if v_actor_role = 'service_role'
    or (v_actor_role = '' and session_user in ('postgres', 'supabase_admin'))
  then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE'
    and old.profile_id is not distinct from new.profile_id
    and old.storage_path is not distinct from new.storage_path
  then
    return new;
  end if;

  v_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;

  update public.profiles
  set
    content_moderation_status = 'pending',
    content_moderation_reviewed_at = null,
    content_moderation_reviewed_by = null,
    content_moderation_reason = 'Profile photo changed and needs content review.'
  where id = v_profile_id
    and coalesce(is_admin, false) = false;

  if tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id then
    update public.profiles
    set
      content_moderation_status = 'pending',
      content_moderation_reviewed_at = null,
      content_moderation_reviewed_by = null,
      content_moderation_reason = 'Profile photo changed and needs content review.'
    where id = old.profile_id
      and coalesce(is_admin, false) = false;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.mark_profile_photo_content_pending()
from public, anon, authenticated, service_role;

drop trigger if exists mark_profile_photo_content_pending_trigger
on public.profile_photos;
create trigger mark_profile_photo_content_pending_trigger
after insert or update of profile_id, storage_path or delete
on public.profile_photos
for each row execute function public.mark_profile_photo_content_pending();

create or replace function public.apply_manual_profile_moderation_decision(
  p_profile_id uuid,
  p_expected_version text,
  p_status text,
  p_reason text,
  p_reviewer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_version text;
  v_updated_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_profile_id is null
    or p_expected_version !~ '^[0-9a-f]{64}$'
    or p_status not in ('approved', 'rejected')
    or p_reason is null
    or pg_catalog.char_length(p_reason) not between 1 and 1000
    or not exists (
      select 1 from public.profiles reviewer
      where reviewer.id = p_reviewer_id
        and coalesce(reviewer.is_admin, false) = true
    )
  then
    return false;
  end if;

  -- Lock before hashing. Profile text writes already hold this row lock, and
  -- photo writes acquire it in their BEFORE trigger.
  perform 1
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.content_moderation_status = 'pending'
    and coalesce(profile.is_admin, false) = false
  for update;

  if not found then
    return false;
  end if;

  v_current_version := public.profile_content_moderation_version(p_profile_id);

  if v_current_version is distinct from p_expected_version then
    return false;
  end if;

  update public.profiles
  set
    content_moderation_status = p_status,
    content_moderation_reviewed_at = pg_catalog.clock_timestamp(),
    content_moderation_reviewed_by = p_reviewer_id,
    content_moderation_reason = p_reason
  where id = p_profile_id
    and content_moderation_status = 'pending'
    and coalesce(is_admin, false) = false;

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.apply_manual_profile_moderation_decision(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.apply_manual_profile_moderation_decision(
  uuid, text, text, text, uuid
) to service_role;

create or replace function public.apply_manual_profile_video_moderation_decision(
  p_video_id uuid,
  p_expected_storage_path text,
  p_status text,
  p_reason text,
  p_reviewer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_count integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_video_id is null
    or p_expected_storage_path is null
    or pg_catalog.char_length(p_expected_storage_path) not between 3 and 1024
    or p_status not in ('approved', 'rejected')
    or p_reason is null
    or pg_catalog.char_length(p_reason) not between 1 and 1000
    or not exists (
      select 1 from public.profiles reviewer
      where reviewer.id = p_reviewer_id
        and coalesce(reviewer.is_admin, false) = true
    )
  then
    return false;
  end if;

  update public.profile_videos
  set
    content_moderation_status = p_status,
    content_moderation_reviewed_at = pg_catalog.clock_timestamp(),
    content_moderation_reviewed_by = p_reviewer_id,
    content_moderation_reason = p_reason
  where id = p_video_id
    and storage_path = p_expected_storage_path
    and content_moderation_status = 'pending';

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.apply_manual_profile_video_moderation_decision(
  uuid, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.apply_manual_profile_video_moderation_decision(
  uuid, text, text, text, uuid
) to service_role;
