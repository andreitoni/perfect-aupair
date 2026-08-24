-- A resource-level lease prevents parallel client requests from spending the
-- global AI budget repeatedly on the same unchanged profile or story.

create table if not exists public.ai_moderation_resource_claims (
  resource_type text not null check (resource_type in ('profile', 'story')),
  resource_id uuid not null,
  resource_version text not null check (char_length(resource_version) = 32),
  claim_token uuid not null,
  claimed_until timestamptz not null,
  completed_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (resource_type, resource_id),
  unique (claim_token)
);

alter table public.ai_moderation_resource_claims enable row level security;
revoke all on table public.ai_moderation_resource_claims
from public, anon, authenticated;
grant select, insert, update, delete
on table public.ai_moderation_resource_claims to service_role;

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
  v_token uuid := gen_random_uuid();
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
    select pg_catalog.md5(pg_catalog.concat_ws(
      chr(31),
      coalesce(profile.full_name, ''),
      coalesce(profile.first_name, ''),
      coalesce(profile.last_name, ''),
      coalesce(profile.bio, ''),
      coalesce(profile.children_info, ''),
      coalesce(profile.accommodation_info, ''),
      coalesce(profile.expectations, ''),
      coalesce((
        select pg_catalog.string_agg(photo.storage_path, chr(31) order by photo.storage_path)
        from public.profile_photos photo
        where photo.profile_id = profile.id
      ), '')
    ))
    into v_version
    from public.profiles profile
    where profile.id = p_resource_id
      and profile.content_moderation_status = 'pending'
      and profile.content_moderation_reviewed_by is null
      and coalesce(profile.is_admin, false) = false;
  else
    select pg_catalog.md5(story.storage_path)
    into v_version
    from public.profile_stories story
    where story.id = p_resource_id
      and story.content_moderation_status = 'pending'
      and story.content_moderation_reviewed_by is null
      and story.expires_at > v_now;
  end if;

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
    v_token,
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
  returning claim_token into v_token;

  return v_token;
end;
$$;

create or replace function public.complete_ai_moderation_resource_claim(
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.ai_moderation_resource_claims
  set
    completed_at = pg_catalog.clock_timestamp(),
    claimed_until = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where claim_token = p_claim_token
    and completed_at is null;

  return found;
end;
$$;

revoke all on function public.claim_ai_moderation_resource(text, uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function public.complete_ai_moderation_resource_claim(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.claim_ai_moderation_resource(text, uuid, integer)
to service_role;
grant execute on function public.complete_ai_moderation_resource_claim(uuid)
to service_role;
