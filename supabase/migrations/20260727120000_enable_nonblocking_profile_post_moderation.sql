-- Profile moderation is post-publication. New profiles and ordinary public
-- text/photo edits enter the admin review queue without disappearing from the
-- catalog or freezing conversations. Explicitly rejected profiles remain
-- hidden until an administrator approves a later revision.

alter table public.profiles
add column if not exists content_moderation_needs_review boolean not null default true;

alter table public.profiles
alter column content_moderation_status set default 'approved';

update public.profiles
set
  content_moderation_needs_review = content_moderation_status = 'pending',
  content_moderation_status = case
    when content_moderation_status = 'pending' then 'approved'
    else content_moderation_status
  end,
  content_moderation_reason = case
    when content_moderation_status = 'pending'
      then coalesce(
        content_moderation_reason,
        'Profile is public and awaiting background content review.'
      )
    else content_moderation_reason
  end;

comment on column public.profiles.content_moderation_needs_review is
  'Internal background-review queue flag. It does not control public visibility or messaging.';

create index if not exists profiles_content_moderation_review_queue_idx
on public.profiles (created_at desc)
where content_moderation_needs_review = true
  and coalesce(is_admin, false) = false;

create or replace function public.protect_profile_server_owned_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
  v_activity_touch boolean := coalesce(
    pg_catalog.current_setting(
      'perfect_aupair.trusted_profile_activity_touch',
      true
    ) = '1',
    false
  );
begin
  if v_actor_role = 'service_role' then
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      'service_role',
      true
    );
    return new;
  end if;

  if
    (
      v_actor_role = ''
      and session_user in ('postgres', 'supabase_admin')
    )
    or pg_catalog.pg_trigger_depth() > 1
  then
    return new;
  end if;

  if
    new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.account_type is distinct from old.account_type
    or new.avatar_url is distinct from old.avatar_url
    or new.onboarding_completed is distinct from old.onboarding_completed
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
    or new.public_slug is distinct from old.public_slug
    or new.is_admin is distinct from old.is_admin
    or new.suspended_at is distinct from old.suspended_at
    or new.suspended_until is distinct from old.suspended_until
    or new.suspended_reason is distinct from old.suspended_reason
    or new.suspended_by is distinct from old.suspended_by
    or new.suspension_rule is distinct from old.suspension_rule
    or new.deletion_requested_at is distinct from old.deletion_requested_at
    or new.deletion_scheduled_at is distinct from old.deletion_scheduled_at
    or new.verification_status is distinct from old.verification_status
    or new.verification_requested_at is distinct from old.verification_requested_at
    or new.verification_reviewed_at is distinct from old.verification_reviewed_at
    or new.verification_rejected_reason is distinct from old.verification_rejected_reason
    or new.content_moderation_status is distinct from old.content_moderation_status
    or new.content_moderation_needs_review is distinct from old.content_moderation_needs_review
    or new.content_moderation_reviewed_at is distinct from old.content_moderation_reviewed_at
    or new.content_moderation_reviewed_by is distinct from old.content_moderation_reviewed_by
    or new.content_moderation_reason is distinct from old.content_moderation_reason
    or (
      new.last_active_at is distinct from old.last_active_at
      and not v_activity_touch
    )
  then
    raise exception 'Server-owned profile fields cannot be changed directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_server_owned_fields()
from public, anon, authenticated, service_role;

create or replace function public.mark_profile_public_content_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
begin
  if v_actor_role = 'service_role'
    or (v_actor_role = '' and session_user in ('postgres', 'supabase_admin'))
    or coalesce(new.is_admin, false)
  then
    return new;
  end if;

  if old.full_name is distinct from new.full_name
    or old.first_name is distinct from new.first_name
    or old.last_name is distinct from new.last_name
    or old.bio is distinct from new.bio
    or old.childcare_experience is distinct from new.childcare_experience
    or old.children_info is distinct from new.children_info
    or old.accommodation_info is distinct from new.accommodation_info
    or old.expectations is distinct from new.expectations
  then
    new.content_moderation_needs_review := true;
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason :=
      'Public profile text changed and awaits background content review.';

    if old.content_moderation_status <> 'rejected' then
      new.content_moderation_status := 'approved';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.mark_profile_public_content_pending()
from public, anon, authenticated, service_role;

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
    content_moderation_status = case
      when content_moderation_status = 'rejected' then 'rejected'
      else 'approved'
    end,
    content_moderation_needs_review = true,
    content_moderation_reviewed_at = null,
    content_moderation_reviewed_by = null,
    content_moderation_reason =
      'Profile photo changed and awaits background content review.'
  where id = v_profile_id
    and coalesce(is_admin, false) = false;

  if tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id then
    update public.profiles
    set
      content_moderation_status = case
        when content_moderation_status = 'rejected' then 'rejected'
        else 'approved'
      end,
      content_moderation_needs_review = true,
      content_moderation_reviewed_at = null,
      content_moderation_reviewed_by = null,
      content_moderation_reason =
        'Profile photo changed and awaits background content review.'
    where id = old.profile_id
      and coalesce(is_admin, false) = false;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.mark_profile_photo_content_pending()
from public, anon, authenticated, service_role;

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

  perform 1
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.content_moderation_needs_review = true
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
    content_moderation_needs_review = false,
    content_moderation_reviewed_at = pg_catalog.clock_timestamp(),
    content_moderation_reviewed_by = p_reviewer_id,
    content_moderation_reason = p_reason
  where id = p_profile_id
    and content_moderation_needs_review = true
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
      content_moderation_needs_review = true,
      content_moderation_reviewed_at = null,
      content_moderation_reviewed_by = null,
      content_moderation_reason =
        'The last profile photo was removed during moderation. A new photo is required.'
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
