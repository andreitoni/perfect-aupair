-- Keep AI moderation bound to the exact account-specific content sent to the
-- provider, and allow an admin to retry a completed failed claim without
-- bypassing the existing resource lease or per-owner budget trigger.

create or replace function public.ai_moderation_resource_version(
  p_resource_type text,
  p_resource_id uuid
)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_version text;
begin
  if p_resource_type = 'profile' then
    select pg_catalog.md5(pg_catalog.concat_ws(
      pg_catalog.chr(31),
      coalesce(profile.account_type, ''),
      coalesce(profile.full_name, ''),
      coalesce(profile.bio, ''),
      case
        when profile.account_type = 'au_pair'
          then coalesce(profile.childcare_experience, '')
        else ''
      end,
      case
        when profile.account_type = 'family'
          then coalesce(profile.children_info, '')
        else ''
      end,
      case
        when profile.account_type = 'family'
          then coalesce(profile.accommodation_info, '')
        else ''
      end,
      case
        when profile.account_type = 'family'
          then coalesce(profile.expectations, '')
        else ''
      end,
      coalesce((
        select pg_catalog.string_agg(
          photo.storage_path,
          pg_catalog.chr(31)
          order by photo.storage_path
        )
        from public.profile_photos photo
        where photo.profile_id = profile.id
      ), '')
    ))
    into v_version
    from public.profiles profile
    where profile.id = p_resource_id;
  elsif p_resource_type = 'story' then
    select pg_catalog.md5(story.storage_path)
    into v_version
    from public.profile_stories story
    where story.id = p_resource_id;
  end if;

  return v_version;
end;
$$;

revoke all on function public.ai_moderation_resource_version(text, uuid)
from public, anon, authenticated, service_role;

create or replace function public.claim_ai_moderation_resource(
  p_resource_type text,
  p_resource_id uuid,
  p_lease_seconds integer default 300
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_version text;
  v_new_token uuid := gen_random_uuid();
  v_claimed_token uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_resource_id is null
    or p_resource_type not in ('profile', 'story')
    or p_lease_seconds not between 30 and 900
  then
    return null;
  end if;

  if p_resource_type = 'profile' then
    perform 1
    from public.profiles profile
    where profile.id = p_resource_id
      and profile.content_moderation_status = 'pending'
      and profile.content_moderation_reviewed_by is null
      and coalesce(profile.is_admin, false) = false
      and exists (
        select 1
        from public.profile_photos photo
        where photo.profile_id = profile.id
      );
  else
    perform 1
    from public.profile_stories story
    where story.id = p_resource_id
      and story.content_moderation_status = 'pending'
      and story.content_moderation_reviewed_by is null
      and story.expires_at > v_now;
  end if;

  if not found then
    return null;
  end if;

  v_version := public.ai_moderation_resource_version(
    p_resource_type,
    p_resource_id
  );

  if v_version is null then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-moderation-resource:' || p_resource_type || ':' || p_resource_id::text,
      0
    )
  );

  delete from public.ai_moderation_resource_claims claim
  where claim.completed_at < v_now - interval '30 days';

  insert into public.ai_moderation_resource_claims (
    resource_type,
    resource_id,
    resource_version,
    claim_token,
    claimed_until,
    completed_at,
    attempt_count,
    updated_at
  ) values (
    p_resource_type,
    p_resource_id,
    v_version,
    v_new_token,
    v_now + pg_catalog.make_interval(secs => p_lease_seconds),
    null,
    1,
    v_now
  )
  on conflict (resource_type, resource_id) do update
  set
    resource_version = excluded.resource_version,
    claim_token = excluded.claim_token,
    claimed_until = excluded.claimed_until,
    completed_at = null,
    attempt_count = case
      when ai_moderation_resource_claims.resource_version = excluded.resource_version
        then ai_moderation_resource_claims.attempt_count + 1
      else 1
    end,
    updated_at = excluded.updated_at
  where
    ai_moderation_resource_claims.resource_version <> excluded.resource_version
    or (
      ai_moderation_resource_claims.completed_at is null
      and ai_moderation_resource_claims.claimed_until <= v_now
    )
  returning claim_token into v_claimed_token;

  return v_claimed_token;
end;
$$;

revoke all on function public.claim_ai_moderation_resource(text, uuid, integer)
from public, anon, authenticated, service_role;
grant execute on function public.claim_ai_moderation_resource(text, uuid, integer)
to service_role;

create or replace function public.apply_ai_moderation_resource_result(
  p_claim_token uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_claim public.ai_moderation_resource_claims%rowtype;
  v_current_version text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_claim_token is null
    or p_resource_id is null
    or p_resource_type not in ('profile', 'story')
    or p_status not in ('pending', 'approved')
    or p_reason is null
    or pg_catalog.char_length(p_reason) not between 1 and 1000
  then
    return false;
  end if;

  select claim.*
  into v_claim
  from public.ai_moderation_resource_claims claim
  where claim.claim_token = p_claim_token
    and claim.resource_type = p_resource_type
    and claim.resource_id = p_resource_id
    and claim.completed_at is null
    and claim.claimed_until > v_now
  for update;

  if not found then
    return false;
  end if;

  if p_resource_type = 'profile' then
    perform 1
    from public.profiles profile
    where profile.id = p_resource_id
      and profile.content_moderation_status = 'pending'
      and profile.content_moderation_reviewed_by is null
      and coalesce(profile.is_admin, false) = false
    for update;

    if not found then
      return false;
    end if;

    v_current_version := public.ai_moderation_resource_version(
      p_resource_type,
      p_resource_id
    );

    if v_current_version is distinct from v_claim.resource_version then
      return false;
    end if;

    update public.profiles
    set
      content_moderation_status = p_status,
      content_moderation_reviewed_at = case
        when p_status = 'approved' then v_now
        else null
      end,
      content_moderation_reviewed_by = null,
      content_moderation_reason = p_reason
    where id = p_resource_id
      and content_moderation_status = 'pending'
      and content_moderation_reviewed_by is null;
  else
    perform 1
    from public.profile_stories story
    where story.id = p_resource_id
      and story.content_moderation_status = 'pending'
      and story.content_moderation_reviewed_by is null
      and story.expires_at > v_now
    for update;

    if not found then
      return false;
    end if;

    v_current_version := public.ai_moderation_resource_version(
      p_resource_type,
      p_resource_id
    );

    if v_current_version is distinct from v_claim.resource_version then
      return false;
    end if;

    update public.profile_stories
    set
      content_moderation_status = p_status,
      content_moderation_reviewed_at = case
        when p_status = 'approved' then v_now
        else null
      end,
      content_moderation_reviewed_by = null,
      content_moderation_reason = p_reason
    where id = p_resource_id
      and content_moderation_status = 'pending'
      and content_moderation_reviewed_by is null
      and expires_at > v_now;
  end if;

  return found;
end;
$$;

revoke all on function public.apply_ai_moderation_resource_result(
  uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.apply_ai_moderation_resource_result(
  uuid, text, uuid, text, text
) to service_role;

create or replace function public.retry_ai_profile_moderation_claim(
  p_profile_id uuid,
  p_expected_version text,
  p_lease_seconds integer default 300
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_resource_version text;
  v_rendered_version text;
  v_new_token uuid := gen_random_uuid();
  v_claimed_token uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_profile_id is null
    or p_expected_version is null
    or p_expected_version !~ '^[0-9a-f]{64}$'
    or p_lease_seconds not between 30 and 900
  then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-moderation-resource:profile:' || p_profile_id::text,
      0
    )
  );

  -- Match apply_ai_moderation_resource_result's claim -> profile lock order.
  perform 1
  from public.ai_moderation_resource_claims claim
  where claim.resource_type = 'profile'
    and claim.resource_id = p_profile_id
  for update;

  perform 1
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.content_moderation_status = 'pending'
    and profile.content_moderation_reviewed_by is null
    and coalesce(profile.is_admin, false) = false
    and exists (
      select 1
      from public.profile_photos photo
      where photo.profile_id = profile.id
    )
  for update;

  if not found then
    return null;
  end if;

  v_rendered_version := public.profile_content_moderation_version(p_profile_id);

  if v_rendered_version is distinct from p_expected_version then
    return null;
  end if;

  v_resource_version := public.ai_moderation_resource_version(
    'profile',
    p_profile_id
  );

  if v_resource_version is null then
    return null;
  end if;

  insert into public.ai_moderation_resource_claims (
    resource_type,
    resource_id,
    resource_version,
    claim_token,
    claimed_until,
    completed_at,
    attempt_count,
    updated_at
  ) values (
    'profile',
    p_profile_id,
    v_resource_version,
    v_new_token,
    v_now + pg_catalog.make_interval(secs => p_lease_seconds),
    null,
    1,
    v_now
  )
  on conflict (resource_type, resource_id) do update
  set
    resource_version = excluded.resource_version,
    claim_token = excluded.claim_token,
    claimed_until = excluded.claimed_until,
    completed_at = null,
    attempt_count = case
      when ai_moderation_resource_claims.resource_version = excluded.resource_version
        then ai_moderation_resource_claims.attempt_count + 1
      else 1
    end,
    updated_at = excluded.updated_at
  where
    ai_moderation_resource_claims.completed_at is not null
    or ai_moderation_resource_claims.claimed_until <= v_now
  returning claim_token into v_claimed_token;

  return v_claimed_token;
end;
$$;

revoke all on function public.retry_ai_profile_moderation_claim(
  uuid, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.retry_ai_profile_moderation_claim(
  uuid, text, integer
) to service_role;
