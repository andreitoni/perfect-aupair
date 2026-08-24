-- Direct Storage SELECT is intentionally unavailable, so browser-side remove()
-- cannot reliably delete even an orphaned object. Queue and claim those deletes
-- at the database boundary, then let a same-origin authenticated route perform
-- the actual Storage API operation with the service role.

alter table public.storage_upload_usage_events
  add column if not exists deletion_claim_token uuid,
  add column if not exists deletion_claimed_at timestamptz,
  add column if not exists orphan_checked_at timestamptz;

create index if not exists storage_upload_usage_pending_delete_idx
on public.storage_upload_usage_events (deletion_claimed_at, created_at)
where deleted_at is null and deletion_claim_token is not null;

drop index if exists public.storage_upload_usage_unreferenced_sweep_idx;
create index storage_upload_usage_unreferenced_sweep_idx
on public.storage_upload_usage_events (
  orphan_checked_at asc nulls first,
  committed_at
)
where deleted_at is null
  and committed_at is not null
  and deletion_claim_token is null;

create or replace function public.media_object_is_referenced(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  case p_bucket_id
    when 'profile-photos' then
      return exists (
        select 1 from public.profile_photos photo
        where photo.storage_path = p_storage_path
      );
    when 'profile-stories' then
      return exists (
        select 1 from public.profile_stories story
        where story.storage_path = p_storage_path
      );
    when 'profile-videos' then
      return exists (
        select 1 from public.profile_videos video
        where video.storage_path = p_storage_path
      );
    when 'message-photos' then
      return exists (
        select 1 from public.messages message
        where message.image_path = p_storage_path
      ) or exists (
        select 1 from public.retained_message_photos retained
        where retained.original_image_path = p_storage_path
      );
    when 'message-videos' then
      return exists (
        select 1 from public.messages message
        where message.video_path = p_storage_path
      ) or exists (
        select 1 from public.retained_message_videos retained
        where retained.original_video_path = p_storage_path
      );
    when 'message-audio' then
      return exists (
        select 1 from public.messages message
        where message.audio_path = p_storage_path
      ) or exists (
        select 1 from public.retained_message_audio retained
        where retained.original_audio_path = p_storage_path
      );
    when 'verification-selfies' then
      return exists (
        select 1 from public.profile_verification_requests request
        where request.selfie_path = p_storage_path
      );
    else
      return true;
  end case;
end;
$$;

revoke all on function public.media_object_is_referenced(text, text)
from public, anon, authenticated, service_role;

create or replace function public.lock_media_reference_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_old_keys text[] := '{}'::text[];
  v_new_keys text[] := '{}'::text[];
  v_all_keys text[];
  v_key text;
  v_bucket text;
  v_path text;
begin
  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
  end if;

  if tg_table_name = 'profile_photos' then
    if tg_op <> 'INSERT' then
      v_old_keys := array_append(v_old_keys, 'profile-photos:' || (v_old ->> 'storage_path'));
    end if;
    if tg_op <> 'DELETE' then
      v_new_keys := array_append(v_new_keys, 'profile-photos:' || (v_new ->> 'storage_path'));
    end if;
  elsif tg_table_name = 'profile_stories' then
    if tg_op <> 'INSERT' then
      v_old_keys := array_append(v_old_keys, 'profile-stories:' || (v_old ->> 'storage_path'));
    end if;
    if tg_op <> 'DELETE' then
      v_new_keys := array_append(v_new_keys, 'profile-stories:' || (v_new ->> 'storage_path'));
    end if;
  elsif tg_table_name = 'profile_videos' then
    if tg_op <> 'INSERT' then
      v_old_keys := array_append(v_old_keys, 'profile-videos:' || (v_old ->> 'storage_path'));
    end if;
    if tg_op <> 'DELETE' then
      v_new_keys := array_append(v_new_keys, 'profile-videos:' || (v_new ->> 'storage_path'));
    end if;
  elsif tg_table_name = 'profile_verification_requests' then
    if tg_op <> 'INSERT' then
      v_old_keys := array_append(v_old_keys, 'verification-selfies:' || (v_old ->> 'selfie_path'));
    end if;
    if tg_op <> 'DELETE' then
      v_new_keys := array_append(v_new_keys, 'verification-selfies:' || (v_new ->> 'selfie_path'));
    end if;
  elsif tg_table_name = 'messages' then
    if tg_op <> 'INSERT' then
      if v_old ->> 'image_path' is not null then
        v_old_keys := array_append(v_old_keys, 'message-photos:' || (v_old ->> 'image_path'));
      end if;
      if v_old ->> 'video_path' is not null then
        v_old_keys := array_append(v_old_keys, 'message-videos:' || (v_old ->> 'video_path'));
      end if;
      if v_old ->> 'audio_path' is not null then
        v_old_keys := array_append(v_old_keys, 'message-audio:' || (v_old ->> 'audio_path'));
      end if;
    end if;
    if tg_op <> 'DELETE' then
      if v_new ->> 'image_path' is not null then
        v_new_keys := array_append(v_new_keys, 'message-photos:' || (v_new ->> 'image_path'));
      end if;
      if v_new ->> 'video_path' is not null then
        v_new_keys := array_append(v_new_keys, 'message-videos:' || (v_new ->> 'video_path'));
      end if;
      if v_new ->> 'audio_path' is not null then
        v_new_keys := array_append(v_new_keys, 'message-audio:' || (v_new ->> 'audio_path'));
      end if;
    end if;
  end if;

  v_all_keys := v_old_keys || v_new_keys;

  for v_key in
    select distinct candidate.key
    from pg_catalog.unnest(v_all_keys) as candidate(key)
    where candidate.key is not null
      and candidate.key !~ ':$'
    order by candidate.key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('media-object:' || v_key, 0)
    );
  end loop;

  if tg_op <> 'DELETE' then
    for v_key in
      select distinct candidate.key
      from pg_catalog.unnest(v_new_keys) as candidate(key)
      where candidate.key is not null
        and candidate.key !~ ':$'
    loop
      v_bucket := pg_catalog.split_part(v_key, ':', 1);
      v_path := pg_catalog.substr(v_key, pg_catalog.strpos(v_key, ':') + 1);

      if exists (
        select 1
        from public.storage_upload_usage_events event
        where event.bucket_id = v_bucket
          and event.object_name = v_path
          and event.deleted_at is null
          and event.deletion_claim_token is not null
      ) then
        raise exception 'Media object is pending deletion' using errcode = '42501';
      end if;

      if v_bucket = 'verification-selfies'
        and (
          tg_op = 'INSERT'
          or (v_new ->> 'selfie_path') is distinct from (v_old ->> 'selfie_path')
        )
        and not exists (
          select 1
          from public.storage_upload_usage_events event
          where event.bucket_id = v_bucket
            and event.object_name = v_path
            and event.uploader_id = (v_new ->> 'profile_id')::uuid
            and event.committed_at is not null
            and event.deleted_at is null
        )
      then
        raise exception 'Invalid verification selfie reference'
          using errcode = '42501';
      end if;
    end loop;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.lock_media_reference_write()
from public, anon, authenticated, service_role;

drop trigger if exists aa_lock_profile_photo_reference
on public.profile_photos;
create trigger aa_lock_profile_photo_reference
before insert or update or delete on public.profile_photos
for each row execute function public.lock_media_reference_write();

drop trigger if exists aa_lock_profile_story_reference
on public.profile_stories;
create trigger aa_lock_profile_story_reference
before insert or update or delete on public.profile_stories
for each row execute function public.lock_media_reference_write();

drop trigger if exists aa_lock_profile_video_reference
on public.profile_videos;
create trigger aa_lock_profile_video_reference
before insert or update or delete on public.profile_videos
for each row execute function public.lock_media_reference_write();

drop trigger if exists aa_lock_verification_selfie_reference
on public.profile_verification_requests;
create trigger aa_lock_verification_selfie_reference
before insert or update or delete on public.profile_verification_requests
for each row execute function public.lock_media_reference_write();

drop trigger if exists aa_lock_message_media_reference
on public.messages;
create trigger aa_lock_message_media_reference
before insert or update or delete on public.messages
for each row execute function public.lock_media_reference_write();

create or replace function public.queue_deleted_profile_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_path text;
begin
  if tg_table_name = 'profile_photos' then
    v_bucket := 'profile-photos';
  elsif tg_table_name = 'profile_stories' then
    v_bucket := 'profile-stories';
  elsif tg_table_name = 'profile_videos' then
    v_bucket := 'profile-videos';
  elsif tg_table_name = 'profile_verification_requests' then
    v_bucket := 'verification-selfies';
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'profile_verification_requests' then
      if new.selfie_path is not distinct from old.selfie_path then
        return new;
      end if;
      v_path := old.selfie_path;
    elsif new.storage_path is not distinct from old.storage_path then
      return new;
    else
      v_path := old.storage_path;
    end if;
  elsif tg_table_name = 'profile_verification_requests' then
    v_path := old.selfie_path;
  else
    v_path := old.storage_path;
  end if;

  if v_path is not null
    and not public.media_object_is_referenced(v_bucket, v_path)
  then
    update public.storage_upload_usage_events
    set
      deletion_claim_token = gen_random_uuid(),
      deletion_claimed_at = pg_catalog.clock_timestamp() - interval '10 minutes'
    where bucket_id = v_bucket
      and object_name = v_path
      and deleted_at is null
      and committed_at is not null;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.queue_deleted_profile_media()
from public, anon, authenticated, service_role;

drop trigger if exists zz_queue_deleted_profile_photo
on public.profile_photos;
create trigger zz_queue_deleted_profile_photo
after update of storage_path or delete on public.profile_photos
for each row execute function public.queue_deleted_profile_media();

drop trigger if exists zz_queue_deleted_profile_story
on public.profile_stories;
create trigger zz_queue_deleted_profile_story
after update of storage_path or delete on public.profile_stories
for each row execute function public.queue_deleted_profile_media();

drop trigger if exists zz_queue_deleted_profile_video
on public.profile_videos;
create trigger zz_queue_deleted_profile_video
after update of storage_path or delete on public.profile_videos
for each row execute function public.queue_deleted_profile_media();

drop trigger if exists zz_queue_deleted_verification_selfie
on public.profile_verification_requests;
create trigger zz_queue_deleted_verification_selfie
after update of selfie_path or delete on public.profile_verification_requests
for each row execute function public.queue_deleted_profile_media();

create or replace function public.claim_orphan_media_deletion(
  p_bucket_id text,
  p_storage_path text,
  p_uploader_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_token uuid;
  v_claimed_at timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_bucket_id is null
    or p_storage_path is null
    or p_bucket_id not in (
      'profile-photos', 'profile-stories', 'profile-videos',
      'message-photos', 'message-videos', 'message-audio',
      'verification-selfies'
    )
    or p_uploader_id is null
    or p_storage_path !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
    or (
      p_bucket_id in (
        'profile-photos', 'profile-stories', 'profile-videos',
        'verification-selfies'
      )
      and (storage.foldername(p_storage_path))[1] <> p_uploader_id::text
    )
  then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-object:' || p_bucket_id || ':' || p_storage_path,
      0
    )
  );

  select event.deletion_claim_token, event.deletion_claimed_at
  into v_token, v_claimed_at
  from public.storage_upload_usage_events event
  where event.bucket_id = p_bucket_id
    and event.object_name = p_storage_path
    and event.uploader_id = p_uploader_id
    and event.committed_at is not null
    and event.deleted_at is null
  for update;

  if not found
    or public.media_object_is_referenced(p_bucket_id, p_storage_path)
    or (v_token is not null and v_claimed_at > v_now - interval '5 minutes')
  then
    return null;
  end if;

  v_token := gen_random_uuid();

  update public.storage_upload_usage_events
  set
    deletion_claim_token = v_token,
    deletion_claimed_at = v_now
  where bucket_id = p_bucket_id
    and object_name = p_storage_path
    and uploader_id = p_uploader_id
    and deleted_at is null;

  return v_token;
end;
$$;

create or replace function public.complete_orphan_media_deletion(
  p_bucket_id text,
  p_storage_path text,
  p_uploader_id uuid,
  p_claim_token uuid,
  p_succeeded boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.storage_upload_usage_events
  set
    deleted_at = case
      when p_succeeded then coalesce(deleted_at, pg_catalog.clock_timestamp())
      else deleted_at
    end,
    deletion_claim_token = null,
    deletion_claimed_at = null
  where bucket_id = p_bucket_id
    and object_name = p_storage_path
    and uploader_id = p_uploader_id
    and deletion_claim_token = p_claim_token;

  v_completed := found;

  if v_completed then
    return true;
  end if;

  -- The Storage DELETE trigger finalizes the ledger before the route can
  -- acknowledge its claim. Accept that already-deleted state idempotently.
  if p_succeeded then
    return exists (
      select 1
      from public.storage_upload_usage_events event
      where event.bucket_id = p_bucket_id
        and event.object_name = p_storage_path
        and event.uploader_id = p_uploader_id
        and event.deleted_at is not null
        and event.deletion_claim_token is null
    );
  end if;

  return false;
end;
$$;

create or replace function public.queue_stale_orphaned_media_uploads(
  p_batch_size integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_scanned integer := 0;
  v_queued integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  p_batch_size := greatest(1, least(p_batch_size, 500));

  for v_candidate in
    select event.bucket_id, event.object_name
    from public.storage_upload_usage_events event
    where event.committed_at is not null
      and event.deleted_at is null
      and event.deletion_claim_token is null
      and event.committed_at < v_now - interval '1 hour'
      and (
        event.orphan_checked_at is null
        or event.orphan_checked_at < v_now - interval '24 hours'
      )
    order by event.orphan_checked_at asc nulls first, event.committed_at
    limit p_batch_size
  loop
    v_scanned := v_scanned + 1;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'media-object:' || v_candidate.bucket_id || ':' || v_candidate.object_name,
        0
      )
    );

    if not public.media_object_is_referenced(
      v_candidate.bucket_id,
      v_candidate.object_name
    ) then
      update public.storage_upload_usage_events
      set
        deletion_claim_token = gen_random_uuid(),
        deletion_claimed_at = v_now - interval '10 minutes'
      where bucket_id = v_candidate.bucket_id
        and object_name = v_candidate.object_name
        and deleted_at is null
        and deletion_claim_token is null;

      if found then v_queued := v_queued + 1; end if;
    else
      update public.storage_upload_usage_events
      set orphan_checked_at = v_now
      where bucket_id = v_candidate.bucket_id
        and object_name = v_candidate.object_name
        and deleted_at is null
        and deletion_claim_token is null;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'scanned', v_scanned,
    'queued', v_queued
  );
end;
$$;

create or replace function public.clear_media_deletion_claim_after_storage_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.storage_upload_usage_events
  set
    deletion_claim_token = null,
    deletion_claimed_at = null
  where bucket_id = old.bucket_id
    and object_name = old.name;

  return old;
end;
$$;

revoke all on function public.clear_media_deletion_claim_after_storage_delete()
from public, anon, authenticated, service_role;

drop trigger if exists zz_clear_media_deletion_claim_after_storage_delete
on storage.objects;
create trigger zz_clear_media_deletion_claim_after_storage_delete
after delete on storage.objects
for each row execute function public.clear_media_deletion_claim_after_storage_delete();

revoke all on function public.claim_orphan_media_deletion(text, text, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.complete_orphan_media_deletion(
  text, text, uuid, uuid, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.queue_stale_orphaned_media_uploads(integer)
from public, anon, authenticated, service_role;
grant execute on function public.claim_orphan_media_deletion(text, text, uuid)
to service_role;
grant execute on function public.complete_orphan_media_deletion(
  text, text, uuid, uuid, boolean
) to service_role;
grant execute on function public.queue_stale_orphaned_media_uploads(integer)
to service_role;
