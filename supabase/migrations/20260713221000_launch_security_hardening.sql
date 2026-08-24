-- Launch hardening: keep server-owned profile state, public stories, direct
-- messages, favorites, and abuse controls enforceable at the database boundary.

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
  -- Service-role operations, migration SQL, and trusted nested audit triggers
  -- remain able to maintain server-owned state.
  if v_actor_role = 'service_role' then
    -- Older audit/moderation triggers read the legacy single-claim GUC. Keep it
    -- synchronized for modern Supabase secret keys before those triggers run.
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

drop trigger if exists aa_protect_profile_server_owned_fields_trigger
on public.profiles;

create trigger aa_protect_profile_server_owned_fields_trigger
before update on public.profiles
for each row
execute function public.protect_profile_server_owned_fields();

create or replace function public.sync_legacy_service_role_trigger_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      'service_role',
      true
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_legacy_service_role_trigger_context()
from public, anon, authenticated, service_role;

drop trigger if exists aa_sync_profile_photo_service_role_context_trigger
on public.profile_photos;

create trigger aa_sync_profile_photo_service_role_context_trigger
before insert or update or delete on public.profile_photos
for each row
execute function public.sync_legacy_service_role_trigger_context();

-- An auth-user cascade starts outside PostgREST and therefore has no JWT role
-- claim. Mark its explicit pre-delete photo cleanup as trusted so the legacy
-- photo audit cannot update a profile tuple that PostgreSQL is already deleting.
create or replace function public.delete_profile_photos_before_profile_cascade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.role',
    'service_role',
    true
  );

  delete from public.profile_photos
  where profile_id = old.id;

  return old;
end;
$$;

revoke all on function public.delete_profile_photos_before_profile_cascade()
from public, anon, authenticated, service_role;

create or replace function public.touch_profile_activity()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_touched_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  perform pg_catalog.set_config(
    'perfect_aupair.trusted_profile_activity_touch',
    '1',
    true
  );

  update public.profiles
  set last_active_at = pg_catalog.clock_timestamp()
  where id = v_user_id
    and onboarding_completed = true
    and suspended_at is null
    and deletion_requested_at is null
    and deletion_scheduled_at is null
    and coalesce(is_admin, false) = false
  returning last_active_at into v_touched_at;

  return v_touched_at;
end;
$$;

revoke all on function public.touch_profile_activity()
from public, anon, authenticated, service_role;
grant execute on function public.touch_profile_activity()
to authenticated, service_role;

-- Verification and report insert policies historically checked only ownership.
-- Stamp workflow state before RLS so a direct authenticated client cannot pose
-- as a reviewer or create an already-approved record.
create or replace function public.prepare_profile_verification_request_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
begin
  if
    v_actor_role = 'service_role'
    or (
      v_actor_role = ''
      and session_user in ('postgres', 'supabase_admin')
    )
  then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Verification review fields are server-owned'
      using errcode = '42501';
  end if;

  if new.profile_id <> (select auth.uid()) then
    raise exception 'Users can only request their own verification'
      using errcode = '42501';
  end if;

  new.status := 'pending';
  new.reviewer_note := '';
  new.created_at := pg_catalog.clock_timestamp();
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

revoke all on function public.prepare_profile_verification_request_write()
from public, anon, authenticated, service_role;

drop trigger if exists aa_prepare_profile_verification_request_write_trigger
on public.profile_verification_requests;

create trigger aa_prepare_profile_verification_request_write_trigger
before insert or update on public.profile_verification_requests
for each row
execute function public.prepare_profile_verification_request_write();

create or replace function public.prepare_moderation_report_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
begin
  if
    v_actor_role = 'service_role'
    or (
      v_actor_role = ''
      and session_user in ('postgres', 'supabase_admin')
    )
  then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Report review fields are server-owned'
      using errcode = '42501';
  end if;

  if new.reporter_id <> (select auth.uid()) then
    raise exception 'Reporter identity does not match the authenticated user'
      using errcode = '42501';
  end if;

  if
    new.subject_type <> 'profile'
    or new.reported_profile_id is null
    or new.subject_id <> new.reported_profile_id
  then
    raise exception 'Invalid reported profile reference'
      using errcode = '22023';
  end if;

  new.status := 'open';
  new.admin_notes := '';
  new.created_at := pg_catalog.clock_timestamp();
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

revoke all on function public.prepare_moderation_report_write()
from public, anon, authenticated, service_role;

drop trigger if exists aa_prepare_moderation_report_write_trigger
on public.moderation_reports;

create trigger aa_prepare_moderation_report_write_trigger
before insert or update on public.moderation_reports
for each row
execute function public.prepare_moderation_report_write();

create or replace function public.database_feature_flag_enabled(p_key text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = p_key
    limit 1
  ), false);
$$;

revoke all on function public.database_feature_flag_enabled(text)
from public, anon, authenticated, service_role;
grant execute on function public.database_feature_flag_enabled(text)
to anon, authenticated, service_role;

create or replace function public.public_profile_is_eligible(
  p_profile_id uuid,
  p_require_photo boolean default true
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles owner_profile
    where owner_profile.id = p_profile_id
      and owner_profile.onboarding_completed = true
      and owner_profile.public_slug is not null
      and owner_profile.suspended_at is null
      and owner_profile.deletion_requested_at is null
      and owner_profile.deletion_scheduled_at is null
      and owner_profile.content_moderation_status = 'approved'
      and coalesce(owner_profile.is_admin, false) = false
      and (
        not p_require_photo
        or exists (
          select 1
          from public.profile_photos photo
          where photo.profile_id = owner_profile.id
        )
      )
  );
$$;

revoke all on function public.public_profile_is_eligible(uuid, boolean)
from public, anon, authenticated, service_role;
grant execute on function public.public_profile_is_eligible(uuid, boolean)
to anon, authenticated, service_role;

-- Stop anonymous/authenticated callers from enumerating photo metadata for
-- hidden, pending, suspended, deleted, or admin profiles. Owners retain access
-- to manage their own rows; authenticated admins retain moderation access.
drop policy if exists "Anyone can view profile photos"
on public.profile_photos;

create policy "Public can view eligible profile photos"
on public.profile_photos
for select
to anon, authenticated
using (
  public.public_profile_is_eligible(profile_id, false)
);

create policy "Owners can view their own profile photos"
on public.profile_photos
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Admins can view profile photos for moderation"
on public.profile_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles viewer_profile
    where viewer_profile.id = (select auth.uid())
      and coalesce(viewer_profile.is_admin, false)
  )
);

-- Stories: remove every historical permissive policy. PostgreSQL combines
-- permissive policies with OR, so leaving even one old policy would bypass the
-- launch gate below.
drop policy if exists "Anyone can view stories" on public.profile_stories;
drop policy if exists "Anyone can view active profile stories" on public.profile_stories;
drop policy if exists "Users can view moderated active profile stories" on public.profile_stories;
drop policy if exists "Users can create own stories" on public.profile_stories;
drop policy if exists "Users can insert their own profile stories" on public.profile_stories;
drop policy if exists "Users can update own stories" on public.profile_stories;
drop policy if exists "Users can delete own stories" on public.profile_stories;
drop policy if exists "Users can delete their own profile stories" on public.profile_stories;

create or replace function public.prepare_authenticated_profile_story_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
  v_now timestamptz;
begin
  if
    v_actor_role = 'service_role'
    or (
      v_actor_role = ''
      and session_user in ('postgres', 'supabase_admin')
    )
  then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if tg_op = 'INSERT' then
    v_now := pg_catalog.clock_timestamp();
    new.created_at := v_now;
    new.expires_at := v_now + interval '24 hours';
    new.content_moderation_status := 'pending';
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason :=
      'New story needs content review.';
    return new;
  end if;

  if
    new.profile_id is distinct from old.profile_id
    or new.storage_path is distinct from old.storage_path
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
    or new.content_moderation_status is distinct from old.content_moderation_status
    or new.content_moderation_reviewed_at is distinct from old.content_moderation_reviewed_at
    or new.content_moderation_reviewed_by is distinct from old.content_moderation_reviewed_by
    or new.content_moderation_reason is distinct from old.content_moderation_reason
  then
    raise exception 'Story lifecycle and moderation fields are server-owned'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_authenticated_profile_story_write()
from public, anon, authenticated, service_role;

drop trigger if exists aa_prepare_authenticated_profile_story_write_trigger
on public.profile_stories;

create trigger aa_prepare_authenticated_profile_story_write_trigger
before insert or update on public.profile_stories
for each row
execute function public.prepare_authenticated_profile_story_write();

create policy "Public can view approved active profile stories"
on public.profile_stories
for select
to anon, authenticated
using (
  public.database_feature_flag_enabled('stories')
  and expires_at > pg_catalog.now()
  and content_moderation_status = 'approved'
  and public.public_profile_is_eligible(profile_id, true)
);

create policy "Owners can view their own profile stories"
on public.profile_stories
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Eligible users can insert their own profile stories"
on public.profile_stories
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and public.database_feature_flag_enabled('stories')
  and public.database_feature_flag_enabled('uploads')
  and public.public_profile_is_eligible((select auth.uid()), true)
);

create policy "Owners can delete their own profile stories"
on public.profile_stories
for delete
to authenticated
using (profile_id = (select auth.uid()));

-- Direct message writes must obey account state and the database kill switch,
-- even if a caller bypasses the Next.js server action.
create or replace function public.message_send_is_allowed(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    p_sender_id is not null
    and p_sender_id = (select auth.uid())
    and public.database_feature_flag_enabled('message_send')
    and exists (
      select 1
      from public.conversations conversation
      join public.profiles family_profile
        on family_profile.id = conversation.family_id
      join public.profiles au_pair_profile
        on au_pair_profile.id = conversation.au_pair_id
      where conversation.id = p_conversation_id
        and p_sender_id in (conversation.family_id, conversation.au_pair_id)
        and not public.profile_pair_blocked(
          conversation.family_id,
          conversation.au_pair_id
        )
        and family_profile.account_type = 'family'
        and au_pair_profile.account_type = 'au_pair'
        and family_profile.onboarding_completed = true
        and au_pair_profile.onboarding_completed = true
        and family_profile.suspended_at is null
        and au_pair_profile.suspended_at is null
        and family_profile.deletion_requested_at is null
        and au_pair_profile.deletion_requested_at is null
        and family_profile.deletion_scheduled_at is null
        and au_pair_profile.deletion_scheduled_at is null
        and coalesce(family_profile.is_admin, false) = false
        and coalesce(au_pair_profile.is_admin, false) = false
        and exists (
          select 1
          from public.profile_photos family_photo
          where family_photo.profile_id = family_profile.id
        )
        and exists (
          select 1
          from public.profile_photos au_pair_photo
          where au_pair_photo.profile_id = au_pair_profile.id
        )
    );
$$;

revoke all on function public.message_send_is_allowed(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.message_send_is_allowed(uuid, uuid)
to authenticated, service_role;

drop policy if exists "Conversation participants can send messages"
on public.messages;

create policy "Eligible conversation participants can send messages"
on public.messages
for insert
to authenticated
with check (
  public.message_send_is_allowed(conversation_id, sender_id)
);

create or replace function public.stamp_authenticated_message_created_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
begin
  if
    v_actor_role = 'service_role'
    or (
      v_actor_role = ''
      and session_user in ('postgres', 'supabase_admin')
    )
  then
    return new;
  end if;

  if not public.message_send_is_allowed(new.conversation_id, new.sender_id) then
    raise exception 'Message sending is not allowed'
      using errcode = '42501';
  end if;

  new.created_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function public.stamp_authenticated_message_created_at()
from public, anon, authenticated, service_role;

drop trigger if exists zz_stamp_authenticated_message_created_at_trigger
on public.messages;

create trigger zz_stamp_authenticated_message_created_at_trigger
before insert on public.messages
for each row
execute function public.stamp_authenticated_message_created_at();

-- Bounded, indexed autocomplete. Empty and oversized terms intentionally
-- return no rows rather than falling back to a full public-catalog scan.
create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_message_autocomplete_trgm_idx
on public.profiles
using gin (
  (
    pg_catalog.lower(
      coalesce(full_name, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(country, '')
    )
  ) extensions.gin_trgm_ops
)
where onboarding_completed = true
  and public_slug is not null
  and suspended_at is null
  and deletion_requested_at is null
  and content_moderation_status = 'approved'
  and coalesce(is_admin, false) = false;

drop function if exists public.get_message_profile_suggestions(text, integer);

create function public.get_message_profile_suggestions(
  p_query text default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  country text,
  city text,
  primary_photo_path text,
  activity_status text,
  verification_status text
)
language sql
security definer
stable
set search_path = ''
as $$
  with normalized as (
    select pg_catalog.btrim(coalesce(p_query, '')) as query
  ),
  viewer as (
    select viewer_profile.id, viewer_profile.account_type
    from public.profiles viewer_profile
    where viewer_profile.id = (select auth.uid())
      and viewer_profile.onboarding_completed = true
      and viewer_profile.public_slug is not null
      and viewer_profile.suspended_at is null
      and viewer_profile.deletion_requested_at is null
      and viewer_profile.deletion_scheduled_at is null
      and viewer_profile.content_moderation_status = 'approved'
      and coalesce(viewer_profile.is_admin, false) = false
      and exists (
        select 1
        from public.profile_photos viewer_photo
        where viewer_photo.profile_id = viewer_profile.id
      )
    limit 1
  )
  select
    target_profile.id,
    target_profile.public_slug,
    target_profile.account_type,
    target_profile.full_name,
    target_profile.country,
    target_profile.city,
    primary_photo.storage_path as primary_photo_path,
    public.profile_activity_status(target_profile.last_active_at) as activity_status,
    target_profile.verification_status
  from viewer
  join public.profiles target_profile
    on target_profile.account_type = case
      when viewer.account_type = 'family' then 'au_pair'
      when viewer.account_type = 'au_pair' then 'family'
      else null
    end
  cross join normalized
  join lateral (
    select photo.storage_path
    from public.profile_photos photo
    where photo.profile_id = target_profile.id
    order by photo.is_primary desc, photo.sort_order asc, photo.created_at asc
    limit 1
  ) primary_photo on true
  where pg_catalog.char_length(normalized.query) between 2 and 64
    and target_profile.onboarding_completed = true
    and target_profile.public_slug is not null
    and target_profile.suspended_at is null
    and target_profile.deletion_requested_at is null
    and target_profile.deletion_scheduled_at is null
    and target_profile.content_moderation_status = 'approved'
    and coalesce(target_profile.is_admin, false) = false
    and not public.profile_pair_blocked(viewer.id, target_profile.id)
    and pg_catalog.lower(
      coalesce(target_profile.full_name, '') || ' ' ||
      coalesce(target_profile.city, '') || ' ' ||
      coalesce(target_profile.country, '')
    ) like '%' || pg_catalog.lower(normalized.query) || '%'
  order by
    case public.profile_activity_status(target_profile.last_active_at)
      when 'active' then 0
      when 'recently_active' then 1
      else 2
    end,
    target_profile.last_active_at desc nulls last,
    target_profile.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 12);
$$;

revoke all on function public.get_message_profile_suggestions(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_message_profile_suggestions(text, integer)
to authenticated;

-- Favorites use the same launch eligibility and block gates as public search.
create or replace function public.profile_favorite_pair_allowed(
  p_actor_id uuid,
  p_target_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    p_actor_id is not null
    and p_target_id is not null
    and p_actor_id <> p_target_id
    and exists (
      select 1
      from public.profiles actor_profile
      join public.profiles target_profile
        on target_profile.id = p_target_id
      where actor_profile.id = p_actor_id
        and actor_profile.account_type <> target_profile.account_type
        and actor_profile.onboarding_completed = true
        and target_profile.onboarding_completed = true
        and actor_profile.public_slug is not null
        and target_profile.public_slug is not null
        and actor_profile.suspended_at is null
        and target_profile.suspended_at is null
        and actor_profile.deletion_requested_at is null
        and target_profile.deletion_requested_at is null
        and actor_profile.deletion_scheduled_at is null
        and target_profile.deletion_scheduled_at is null
        and actor_profile.content_moderation_status = 'approved'
        and target_profile.content_moderation_status = 'approved'
        and coalesce(actor_profile.is_admin, false) = false
        and coalesce(target_profile.is_admin, false) = false
        and not public.profile_pair_blocked(p_actor_id, p_target_id)
        and exists (
          select 1
          from public.profile_photos actor_photo
          where actor_photo.profile_id = actor_profile.id
        )
        and exists (
          select 1
          from public.profile_photos target_photo
          where target_photo.profile_id = target_profile.id
        )
    );
$$;

revoke all on function public.profile_favorite_pair_allowed(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.profile_favorite_pair_allowed(uuid, uuid)
to authenticated, service_role;

drop policy if exists "Users can save opposite profile type"
on public.profile_favorites;

create policy "Eligible users can save visible opposite profiles"
on public.profile_favorites
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.profile_favorite_pair_allowed(user_id, profile_id)
);

create or replace function public.validate_profile_favorite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.profile_favorite_pair_allowed(new.user_id, new.profile_id) then
    raise exception 'This profile cannot be saved'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and coalesce((select auth.role()), '') = 'authenticated' then
    new.created_at := pg_catalog.clock_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function public.validate_profile_favorite()
from public, anon, authenticated, service_role;

create or replace function public.toggle_profile_favorite(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_profile_id is null or v_user_id = p_profile_id then
    raise exception 'You cannot save your own profile';
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
    raise exception 'This profile cannot be saved'
      using errcode = '42501';
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

create table if not exists public.profile_favorite_notification_claims (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (actor_id, recipient_id),
  constraint profile_favorite_notification_claims_not_self
    check (actor_id <> recipient_id)
);

alter table public.profile_favorite_notification_claims enable row level security;
revoke all on table public.profile_favorite_notification_claims
from anon, authenticated;
grant select, insert, update, delete
on table public.profile_favorite_notification_claims to service_role;

create or replace function public.claim_profile_favorite_notification(
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_claimed boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profile_favorites favorite
    where favorite.user_id = v_user_id
      and favorite.profile_id = p_profile_id
  ) or not public.profile_favorite_pair_allowed(v_user_id, p_profile_id) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-favorite-notification:' ||
      v_user_id::text || ':' || p_profile_id::text,
      0
    )
  );

  insert into public.profile_favorite_notification_claims (
    actor_id,
    recipient_id,
    claimed_at
  )
  values (
    v_user_id,
    p_profile_id,
    pg_catalog.clock_timestamp()
  )
  on conflict (actor_id, recipient_id) do update
  set claimed_at = excluded.claimed_at
  where profile_favorite_notification_claims.claimed_at
    <= pg_catalog.clock_timestamp() - interval '7 days'
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_profile_favorite_notification(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.claim_profile_favorite_notification(uuid)
to authenticated;

-- Account-deletion reminder workers use a short lease instead of the former
-- select -> send -> update race. A provider idempotency key (wired in the app)
-- covers the remaining crash-after-send window.
alter table public.account_deletion_requests
add column if not exists reminder_claim_token uuid,
add column if not exists reminder_claimed_at timestamptz;

create index if not exists account_deletion_requests_reminder_claim_idx
on public.account_deletion_requests (scheduled_delete_at, reminder_claimed_at)
where status = 'pending'
  and reminder_sent_at is null;

create or replace function public.claim_account_deletion_reminders(
  p_batch_size integer default 50,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  id uuid,
  profile_id uuid,
  email text,
  scheduled_delete_at timestamptz,
  claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'Invalid reminder batch size';
  end if;

  return query
  with claimable as (
    select deletion_request.id
    from public.account_deletion_requests deletion_request
    join public.profiles profile
      on profile.id = deletion_request.profile_id
    where deletion_request.status = 'pending'
      and deletion_request.reminder_sent_at is null
      and deletion_request.scheduled_delete_at > p_now
      and deletion_request.scheduled_delete_at <= p_now + interval '24 hours'
      and (
        deletion_request.reminder_claim_token is null
        or deletion_request.reminder_claimed_at
          <= p_now - interval '30 minutes'
      )
      and profile.deletion_requested_at is not null
      and not coalesce(profile.is_admin, false)
    order by deletion_request.scheduled_delete_at, deletion_request.id
    for update of deletion_request skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.account_deletion_requests deletion_request
    set
      reminder_claim_token = gen_random_uuid(),
      reminder_claimed_at = p_now
    from claimable
    where deletion_request.id = claimable.id
    returning
      deletion_request.id,
      deletion_request.profile_id,
      deletion_request.email,
      deletion_request.scheduled_delete_at,
      deletion_request.reminder_claim_token
  )
  select
    claimed.id,
    claimed.profile_id,
    claimed.email,
    claimed.scheduled_delete_at,
    claimed.reminder_claim_token
  from claimed
  order by claimed.scheduled_delete_at, claimed.id;
end;
$$;

create or replace function public.complete_account_deletion_reminder(
  p_request_id uuid,
  p_claim_token uuid,
  p_sent_at timestamptz default pg_catalog.clock_timestamp()
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

  update public.account_deletion_requests
  set
    reminder_sent_at = p_sent_at,
    reminder_claim_token = null,
    reminder_claimed_at = null
  where id = p_request_id
    and status = 'pending'
    and reminder_sent_at is null
    and reminder_claim_token = p_claim_token
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create or replace function public.release_account_deletion_reminder_claim(
  p_request_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set
    reminder_claim_token = null,
    reminder_claimed_at = null
  where id = p_request_id
    and status = 'pending'
    and reminder_sent_at is null
    and reminder_claim_token = p_claim_token
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_account_deletion_reminders(integer, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.complete_account_deletion_reminder(uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;
revoke all on function public.release_account_deletion_reminder_claim(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.claim_account_deletion_reminders(integer, timestamptz)
to service_role;
grant execute on function public.complete_account_deletion_reminder(uuid, uuid, timestamptz)
to service_role;
grant execute on function public.release_account_deletion_reminder_claim(uuid, uuid)
to service_role;

-- Serialize each rate-limit identity before the existing insert-then-count RPC
-- evaluates its window. This closes the concurrent burst race without changing
-- the externally consumed RPC result shape.
create or replace function public.serialize_security_rate_limit_event_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'security-rate:subject:' || new.action || ':' || new.subject_hash,
        0
      )
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-rate:ip:' || new.action || ':' || new.ip_hash,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'security-rate:prefix:' || new.action || ':' || new.ip_prefix_hash,
      0
    )
  );

  -- Once an identity is already blocked for its computed retry window, keep
  -- returning the existing decision without appending unlimited event rows.
  if exists (
    select 1
    from public.security_rate_limit_events event
    where event.action = new.action
      and event.blocked
      and event.retry_after_seconds is not null
      and event.created_at
        + pg_catalog.make_interval(secs => event.retry_after_seconds)
        > pg_catalog.clock_timestamp()
      and (
        (
          event.reason = 'ip_limit'
          and event.ip_hash = new.ip_hash
        )
        or (
          event.reason = 'ip_prefix_limit'
          and event.ip_prefix_hash = new.ip_prefix_hash
        )
        or (
          event.reason = 'subject_limit'
          and new.subject_hash is not null
          and event.subject_hash = new.subject_hash
        )
      )
  ) then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.serialize_security_rate_limit_event_insert()
from public, anon, authenticated, service_role;

drop trigger if exists serialize_security_rate_limit_event_insert_trigger
on public.security_rate_limit_events;

create trigger serialize_security_rate_limit_event_insert_trigger
before insert on public.security_rate_limit_events
for each row
execute function public.serialize_security_rate_limit_event_insert();
