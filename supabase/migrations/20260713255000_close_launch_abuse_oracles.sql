-- Bound direct Supabase abuse paths that can otherwise amplify writes, exhaust
-- shared budgets, or reveal trust-and-safety relationships between third parties.

create table if not exists public.storage_upload_attempt_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count between 1 and 60),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.storage_upload_attempt_counters enable row level security;
revoke all on table public.storage_upload_attempt_counters
from public, anon, authenticated;
grant select, insert, update, delete
on table public.storage_upload_attempt_counters to service_role;

alter function public.reserve_storage_upload_quota(text, text, bigint)
rename to reserve_storage_upload_quota_internal;

revoke all on function public.reserve_storage_upload_quota_internal(
  text, text, bigint
) from public, anon, authenticated, service_role;

create function public.reserve_storage_upload_quota(
  p_bucket_id text,
  p_object_name text,
  p_size_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing_size bigint;
  v_window_started_at timestamptz;
  v_attempt_count integer;
  v_counter_found boolean;
begin
  if v_user_id is null
    or p_bucket_id not in (
      'profile-photos',
      'profile-stories',
      'profile-videos',
      'message-photos',
      'message-videos',
      'message-audio',
      'verification-selfies'
    )
    or p_object_name is null
    or pg_catalog.char_length(p_object_name) not between 3 and 1024
    or p_size_bytes is null
    or p_size_bytes < 0
  then
    return false;
  end if;

  -- The browser reserves a path before upload and the Storage INSERT policy
  -- checks it again. Identical checks are a read-only no-op and never touch the
  -- shared bucket lock or the attempt counter.
  select event.size_bytes
  into v_existing_size
  from public.storage_upload_usage_events event
  where event.uploader_id = v_user_id
    and event.bucket_id = p_bucket_id
    and event.object_name = p_object_name
    and event.deleted_at is null
  limit 1;

  if found and p_size_bytes <= v_existing_size then
    return true;
  end if;

  -- Only serialize this user's new-path attempts. Once the bounded window is
  -- full, repeated calls become read-only and cannot starve another uploader.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:storage-upload-attempt:' || v_user_id::text,
      0
    )
  );

  select counter.window_started_at, counter.attempt_count
  into v_window_started_at, v_attempt_count
  from public.storage_upload_attempt_counters counter
  where counter.user_id = v_user_id;
  v_counter_found := found;

  if v_counter_found
    and v_window_started_at > v_now - interval '10 minutes'
    and v_attempt_count >= 60
  then
    return false;
  end if;

  if not v_counter_found then
    insert into public.storage_upload_attempt_counters (
      user_id,
      window_started_at,
      attempt_count,
      updated_at
    ) values (
      v_user_id,
      v_now,
      1,
      v_now
    );
  elsif v_window_started_at <= v_now - interval '10 minutes' then
    update public.storage_upload_attempt_counters
    set
      window_started_at = v_now,
      attempt_count = 1,
      updated_at = v_now
    where user_id = v_user_id;
  else
    update public.storage_upload_attempt_counters
    set
      attempt_count = attempt_count + 1,
      updated_at = v_now
    where user_id = v_user_id;
  end if;

  return public.reserve_storage_upload_quota_internal(
    p_bucket_id,
    p_object_name,
    p_size_bytes
  );
end;
$$;

revoke all on function public.reserve_storage_upload_quota(text, text, bigint)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_storage_upload_quota(text, text, bigint)
to authenticated;

-- Policy expressions retain function OIDs across a rename. Recreate every
-- upload policy so all Storage writes pass through the bounded wrapper.
drop policy if exists "Users can upload their own profile photo files"
on storage.objects;
create policy "Users can upload their own profile photo files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Users can upload own profile story files"
on storage.objects;
create policy "Users can upload own profile story files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.can_submit_profile_story()
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Users can upload own profile video files"
on storage.objects;
create policy "Users can upload own profile video files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Conversation participants can upload message photo files"
on storage.objects;
create policy "Conversation participants can upload message photo files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-photos'
  and public.message_send_is_allowed(
    (storage.foldername(name))[1]::uuid,
    (select auth.uid())
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Conversation participants can upload message video files"
on storage.objects;
create policy "Conversation participants can upload message video files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-videos'
  and public.message_send_is_allowed(
    (storage.foldername(name))[1]::uuid,
    (select auth.uid())
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Conversation participants can upload message audio files"
on storage.objects;
create policy "Conversation participants can upload message audio files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-audio'
  and public.message_send_is_allowed(
    (storage.foldername(name))[1]::uuid,
    (select auth.uid())
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Users can upload own verification selfies"
on storage.objects;
create policy "Users can upload own verification selfies"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

-- Keep the raw relationship lookup internal. The public helper remains useful
-- to the app, but an authenticated caller may only ask about their own pair.
create or replace function public.profile_pair_blocked_internal(
  p_first_profile_id uuid,
  p_second_profile_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_blocks block
    where (
      block.blocker_id = p_first_profile_id
      and block.blocked_profile_id = p_second_profile_id
    ) or (
      block.blocker_id = p_second_profile_id
      and block.blocked_profile_id = p_first_profile_id
    )
  );
$$;

revoke all on function public.profile_pair_blocked_internal(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.profile_pair_blocked(
  p_first_profile_id uuid,
  p_second_profile_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if coalesce((select auth.role()), '') = 'authenticated'
    and (
      v_user_id is null
      or v_user_id not in (p_first_profile_id, p_second_profile_id)
    )
  then
    return false;
  end if;

  return public.profile_pair_blocked_internal(
    p_first_profile_id,
    p_second_profile_id
  );
end;
$$;

revoke all on function public.profile_pair_blocked(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.profile_pair_blocked(uuid, uuid)
to authenticated, service_role;

alter function public.profile_favorite_pair_allowed(uuid, uuid)
rename to profile_favorite_pair_allowed_internal;

revoke all on function public.profile_favorite_pair_allowed_internal(uuid, uuid)
from public, anon, authenticated, service_role;

create function public.profile_favorite_pair_allowed(
  p_actor_id uuid,
  p_target_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'authenticated'
    and p_actor_id is distinct from (select auth.uid())
  then
    return false;
  end if;

  return public.profile_favorite_pair_allowed_internal(
    p_actor_id,
    p_target_id
  );
end;
$$;

revoke all on function public.profile_favorite_pair_allowed(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.profile_favorite_pair_allowed(uuid, uuid)
to authenticated, service_role;

-- Favorites are RPC-only mutations. A bounded fixed-window counter prevents a
-- single pair from generating unlimited INSERT/DELETE WAL through PostgREST.
drop policy if exists "Eligible users can save visible opposite profiles"
on public.profile_favorites;
drop policy if exists "Users can delete their own favorites"
on public.profile_favorites;
revoke all on table public.profile_favorites
from public, anon, authenticated;
grant select on table public.profile_favorites to authenticated;
grant select, insert, update, delete
on table public.profile_favorites to service_role;

create table if not exists public.profile_favorite_toggle_counters (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  change_count integer not null check (change_count between 1 and 40),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.profile_favorite_toggle_counters enable row level security;
revoke all on table public.profile_favorite_toggle_counters
from public, anon, authenticated;
grant select, insert, update, delete
on table public.profile_favorite_toggle_counters to service_role;

create or replace function public.toggle_profile_favorite(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_change_count integer;
  v_counter_found boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_profile_id is null or v_user_id = p_profile_id then
    raise exception 'You cannot save your own profile';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:favorite-toggle:' || v_user_id::text,
      0
    )
  );

  select counter.window_started_at, counter.change_count
  into v_window_started_at, v_change_count
  from public.profile_favorite_toggle_counters counter
  where counter.user_id = v_user_id;
  v_counter_found := found;

  if v_counter_found
    and v_window_started_at > v_now - interval '10 minutes'
    and v_change_count >= 40
  then
    raise exception 'Favorite change limit reached' using errcode = 'P0001';
  end if;

  if not v_counter_found then
    insert into public.profile_favorite_toggle_counters (
      user_id,
      window_started_at,
      change_count,
      updated_at
    ) values (v_user_id, v_now, 1, v_now);
  elsif v_window_started_at <= v_now - interval '10 minutes' then
    update public.profile_favorite_toggle_counters
    set window_started_at = v_now, change_count = 1, updated_at = v_now
    where user_id = v_user_id;
  else
    update public.profile_favorite_toggle_counters
    set change_count = change_count + 1, updated_at = v_now
    where user_id = v_user_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-favorite:' || v_user_id::text || ':' || p_profile_id::text,
      0
    )
  );

  delete from public.profile_favorites favorite
  where favorite.user_id = v_user_id
    and favorite.profile_id = p_profile_id;

  if found then
    return false;
  end if;

  if not public.profile_favorite_pair_allowed(v_user_id, p_profile_id) then
    raise exception 'This profile cannot be saved' using errcode = '42501';
  end if;

  insert into public.profile_favorites (user_id, profile_id)
  values (v_user_id, p_profile_id);

  return true;
end;
$$;

revoke all on function public.toggle_profile_favorite(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.toggle_profile_favorite(uuid)
to authenticated;

-- Block/unblock events are written only for real state transitions and share a
-- small per-user safety-action budget.
create table if not exists public.profile_safety_action_counters (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  change_count integer not null check (change_count between 1 and 20),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.profile_safety_action_counters enable row level security;
revoke all on table public.profile_safety_action_counters
from public, anon, authenticated;
grant select, insert, update, delete
on table public.profile_safety_action_counters to service_role;

create or replace function public.consume_profile_safety_action_budget(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_change_count integer;
  v_counter_found boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:profile-safety-action:' || p_user_id::text,
      0
    )
  );

  select counter.window_started_at, counter.change_count
  into v_window_started_at, v_change_count
  from public.profile_safety_action_counters counter
  where counter.user_id = p_user_id;
  v_counter_found := found;

  if v_counter_found
    and v_window_started_at > v_now - interval '1 hour'
    and v_change_count >= 20
  then
    return false;
  end if;

  if not v_counter_found then
    insert into public.profile_safety_action_counters (
      user_id,
      window_started_at,
      change_count,
      updated_at
    ) values (p_user_id, v_now, 1, v_now);
  elsif v_window_started_at <= v_now - interval '1 hour' then
    update public.profile_safety_action_counters
    set window_started_at = v_now, change_count = 1, updated_at = v_now
    where user_id = p_user_id;
  else
    update public.profile_safety_action_counters
    set change_count = change_count + 1, updated_at = v_now
    where user_id = p_user_id;
  end if;

  return true;
end;
$$;

revoke all on function public.consume_profile_safety_action_budget(uuid)
from public, anon, authenticated, service_role;

create or replace function public.block_profile(p_blocked_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_recent_unblock_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_blocked_profile_id is null or p_blocked_profile_id = v_user_id then
    raise exception 'Invalid profile';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_blocked_profile_id
  ) then
    raise exception 'Profile not found';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where (
      conversation.family_id = v_user_id
      and conversation.au_pair_id = p_blocked_profile_id
    ) or (
      conversation.au_pair_id = v_user_id
      and conversation.family_id = p_blocked_profile_id
    )
  ) then
    raise exception 'Conversation not found';
  end if;

  select event.created_at
  into v_recent_unblock_at
  from public.profile_block_events event
  where event.blocker_id = v_user_id
    and event.blocked_profile_id = p_blocked_profile_id
    and event.action = 'unblocked'
    and event.created_at >= pg_catalog.clock_timestamp() - interval '48 hours'
  order by event.created_at desc
  limit 1;

  if v_recent_unblock_at is not null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'error_code', 'block_cooldown',
      'retry_at', v_recent_unblock_at + interval '48 hours'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-block:' || v_user_id::text || ':' || p_blocked_profile_id::text,
      0
    )
  );

  if exists (
    select 1 from public.profile_blocks block
    where block.blocker_id = v_user_id
      and block.blocked_profile_id = p_blocked_profile_id
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'changed', false);
  end if;

  if not public.consume_profile_safety_action_budget(v_user_id) then
    raise exception 'Safety action limit reached' using errcode = 'P0001';
  end if;

  insert into public.profile_blocks (blocker_id, blocked_profile_id)
  values (v_user_id, p_blocked_profile_id);

  insert into public.profile_block_events (
    blocker_id,
    blocked_profile_id,
    action
  ) values (v_user_id, p_blocked_profile_id, 'blocked');

  return pg_catalog.jsonb_build_object('ok', true, 'changed', true);
end;
$$;

create or replace function public.unblock_profile(p_blocked_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_blocked_profile_id is null or p_blocked_profile_id = v_user_id then
    raise exception 'Invalid profile';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_blocked_profile_id
  ) then
    raise exception 'Profile not found';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where (
      conversation.family_id = v_user_id
      and conversation.au_pair_id = p_blocked_profile_id
    ) or (
      conversation.au_pair_id = v_user_id
      and conversation.family_id = p_blocked_profile_id
    )
  ) and not exists (
    select 1 from public.profile_blocks block
    where block.blocker_id = v_user_id
      and block.blocked_profile_id = p_blocked_profile_id
  ) then
    raise exception 'Conversation not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-block:' || v_user_id::text || ':' || p_blocked_profile_id::text,
      0
    )
  );

  if not exists (
    select 1 from public.profile_blocks block
    where block.blocker_id = v_user_id
      and block.blocked_profile_id = p_blocked_profile_id
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'changed', false);
  end if;

  if not public.consume_profile_safety_action_budget(v_user_id) then
    raise exception 'Safety action limit reached' using errcode = 'P0001';
  end if;

  delete from public.profile_blocks block
  where block.blocker_id = v_user_id
    and block.blocked_profile_id = p_blocked_profile_id;

  insert into public.profile_block_events (
    blocker_id,
    blocked_profile_id,
    action
  ) values (v_user_id, p_blocked_profile_id, 'unblocked');

  return pg_catalog.jsonb_build_object('ok', true, 'changed', true);
end;
$$;

revoke all on function public.block_profile(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.unblock_profile(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.block_profile(uuid) to authenticated;
grant execute on function public.unblock_profile(uuid) to authenticated;

-- Email is needed while deletion can still be cancelled and for the scheduled
-- reminder. Once the profile is actually removed, retain only pseudonymous
-- request metadata needed to evidence the deletion workflow.
create or replace function public.scrub_deleted_profile_request_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_deletion_requests deletion_request
  set email = null
  where deletion_request.profile_id = old.id
    and deletion_request.email is not null;

  return old;
end;
$$;

revoke all on function public.scrub_deleted_profile_request_emails()
from public, anon, authenticated, service_role;

drop trigger if exists zz_scrub_deleted_profile_request_emails
on public.profiles;
create trigger zz_scrub_deleted_profile_request_emails
after delete on public.profiles
for each row execute function public.scrub_deleted_profile_request_emails();

-- A per-owner budget prevents one account from draining the shared OpenAI
-- moderation allowance by repeatedly changing the same public resource.
create table if not exists public.ai_moderation_owner_usage_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  resource_type text not null check (resource_type in ('profile', 'story')),
  resource_id uuid not null,
  resource_version text not null check (pg_catalog.char_length(resource_version) = 32),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index if not exists ai_moderation_owner_usage_owner_created_idx
on public.ai_moderation_owner_usage_events (owner_id, created_at desc);

alter table public.ai_moderation_owner_usage_events enable row level security;
revoke all on table public.ai_moderation_owner_usage_events
from public, anon, authenticated;
grant select, insert, update, delete
on table public.ai_moderation_owner_usage_events to service_role;

create or replace function public.enforce_ai_moderation_owner_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_total_count integer;
  v_profile_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if new.resource_type = 'profile' then
    v_owner_id := new.resource_id;
  else
    select story.profile_id
    into v_owner_id
    from public.profile_stories story
    where story.id = new.resource_id;
  end if;

  if v_owner_id is null then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:ai-moderation-owner:' || v_owner_id::text,
      0
    )
  );

  delete from public.ai_moderation_owner_usage_events event
  where event.owner_id = v_owner_id
    and event.created_at <= v_now - interval '30 days';

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where event.resource_type = 'profile'
    )::integer
  into v_total_count, v_profile_count
  from public.ai_moderation_owner_usage_events event
  where event.owner_id = v_owner_id
    and event.created_at > v_now - interval '24 hours';

  if v_total_count >= 40
    or (new.resource_type = 'profile' and v_profile_count >= 10)
  then
    return null;
  end if;

  return new;
end;
$$;

create or replace function public.record_ai_moderation_owner_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  if new.resource_type = 'profile' then
    v_owner_id := new.resource_id;
  else
    select story.profile_id
    into v_owner_id
    from public.profile_stories story
    where story.id = new.resource_id;
  end if;

  if v_owner_id is not null then
    insert into public.ai_moderation_owner_usage_events (
      owner_id,
      resource_type,
      resource_id,
      resource_version
    ) values (
      v_owner_id,
      new.resource_type,
      new.resource_id,
      new.resource_version
    );
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_ai_moderation_owner_budget()
from public, anon, authenticated, service_role;
revoke all on function public.record_ai_moderation_owner_usage()
from public, anon, authenticated, service_role;

drop trigger if exists aa_enforce_ai_moderation_owner_budget
on public.ai_moderation_resource_claims;
create trigger aa_enforce_ai_moderation_owner_budget
before insert or update of claim_token, resource_version
on public.ai_moderation_resource_claims
for each row execute function public.enforce_ai_moderation_owner_budget();

drop trigger if exists zz_record_ai_moderation_owner_usage
on public.ai_moderation_resource_claims;
create trigger zz_record_ai_moderation_owner_usage
after insert or update of claim_token, resource_version
on public.ai_moderation_resource_claims
for each row execute function public.record_ai_moderation_owner_usage();
