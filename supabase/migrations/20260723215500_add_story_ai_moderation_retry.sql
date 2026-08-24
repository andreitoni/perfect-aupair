-- Allow an admin to retry AI moderation for the exact active story version
-- while preserving the existing resource lease and claim lock order.

create or replace function public.retry_ai_story_moderation_claim(
  p_story_id uuid,
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
  v_new_token uuid := gen_random_uuid();
  v_claimed_token uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_story_id is null
    or p_expected_version is null
    or p_expected_version !~ '^[0-9a-f]{32}$'
    or p_lease_seconds not between 30 and 900
  then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-moderation-resource:story:' || p_story_id::text,
      0
    )
  );

  -- Match apply_ai_moderation_resource_result's claim -> story lock order.
  perform 1
  from public.ai_moderation_resource_claims claim
  where claim.resource_type = 'story'
    and claim.resource_id = p_story_id
  for update;

  perform 1
  from public.profile_stories story
  join public.profiles owner_profile
    on owner_profile.id = story.profile_id
  where story.id = p_story_id
    and story.content_moderation_status = 'pending'
    and story.content_moderation_reviewed_by is null
    and story.expires_at > v_now
    and coalesce(owner_profile.is_admin, false) = false
  for update of story;

  if not found then
    return null;
  end if;

  v_resource_version := public.ai_moderation_resource_version(
    'story',
    p_story_id
  );

  if v_resource_version is null
    or v_resource_version is distinct from p_expected_version
  then
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
    'story',
    p_story_id,
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

revoke all on function public.retry_ai_story_moderation_claim(
  uuid, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.retry_ai_story_moderation_claim(
  uuid, text, integer
) to service_role;
