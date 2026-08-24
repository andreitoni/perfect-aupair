create table if not exists public.profile_search_rate_counters (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (profile_id, window_started_at)
);

alter table public.profile_search_rate_counters enable row level security;
revoke all on table public.profile_search_rate_counters
from public, anon, authenticated;
grant select, insert, update, delete
on table public.profile_search_rate_counters to service_role;

create or replace function public.reserve_profile_search_request(
  p_limit_per_minute integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_window timestamptz := pg_catalog.date_trunc(
    'minute',
    pg_catalog.clock_timestamp()
  );
  v_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  if p_limit_per_minute is null
    or p_limit_per_minute < 1
    or p_limit_per_minute > 120
  then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-search:' || v_user_id::text || ':' || v_window::text,
      0
    )
  );

  delete from public.profile_search_rate_counters counter
  where counter.profile_id = v_user_id
    and counter.window_started_at < v_window - interval '1 day';

  select counter.request_count
  into v_count
  from public.profile_search_rate_counters counter
  where counter.profile_id = v_user_id
    and counter.window_started_at = v_window;

  -- Once saturated, reject without producing another UPDATE/WAL record.
  if coalesce(v_count, 0) >= p_limit_per_minute then
    return false;
  end if;

  insert into public.profile_search_rate_counters (
    profile_id,
    window_started_at,
    request_count
  )
  values (v_user_id, v_window, 1)
  on conflict (profile_id, window_started_at) do update
  set request_count = profile_search_rate_counters.request_count + 1
  returning request_count into v_count;

  return v_count <= p_limit_per_minute;
end;
$$;

revoke all on function public.reserve_profile_search_request(integer)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_profile_search_request(integer)
to authenticated;

create or replace function public.profile_discovery_normalize_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(extensions.unaccent(
          pg_catalog.regexp_replace(
            coalesce(p_value, ''),
            '[_-]+',
            ' ',
            'g'
          )
        )),
        '[^[:alnum:]'' ]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function public.profile_discovery_normalize_text(text)
from public, anon;
grant execute on function public.profile_discovery_normalize_text(text)
to authenticated, service_role;

create or replace function public.profile_discovery_search_text(
  p_full_name text,
  p_first_name text,
  p_city text,
  p_country text,
  p_nationality text,
  p_preferred_host_countries text[],
  p_mother_tongue text,
  p_fluent_languages text[],
  p_basic_languages text[],
  p_children_info text,
  p_will_care_for_elderly boolean,
  p_will_care_for_pets boolean
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.profile_discovery_normalize_text(
    coalesce(p_full_name, '') || ' ' ||
    coalesce(p_first_name, '') || ' ' ||
    coalesce(p_city, '') || ' ' ||
    coalesce(p_country, '') || ' ' ||
    coalesce(p_nationality, '') || ' ' ||
    coalesce(pg_catalog.array_to_string(p_preferred_host_countries, ' '), '') || ' ' ||
    coalesce(p_mother_tongue, '') || ' ' ||
    coalesce(pg_catalog.array_to_string(p_fluent_languages, ' '), '') || ' ' ||
    coalesce(pg_catalog.array_to_string(p_basic_languages, ' '), '') || ' ' ||
    coalesce(p_children_info, '') || ' ' ||
    case when coalesce(p_will_care_for_elderly, false)
      then 'elderly care senior care' else '' end || ' ' ||
    case when coalesce(p_will_care_for_pets, false)
      then 'pet care pets' else '' end
  );
$$;

revoke all on function public.profile_discovery_search_text(
  text, text, text, text, text, text[], text, text[], text[], text,
  boolean, boolean
) from public, anon;
grant execute on function public.profile_discovery_search_text(
  text, text, text, text, text, text[], text, text[], text[], text,
  boolean, boolean
) to authenticated, service_role;

create index if not exists profiles_discovery_search_trgm_idx
on public.profiles
using gin (
  public.profile_discovery_search_text(
    full_name,
    first_name,
    city,
    country,
    nationality,
    preferred_host_countries,
    mother_tongue,
    fluent_languages,
    basic_languages,
    children_info,
    will_care_for_elderly,
    will_care_for_pets
  ) extensions.gin_trgm_ops
)
where onboarding_completed = true
  and public_slug is not null
  and suspended_at is null
  and deletion_requested_at is null
  and deletion_scheduled_at is null
  and content_moderation_status = 'approved'
  and coalesce(is_admin, false) = false;

create or replace function public.search_profile_cards(
  p_query text,
  p_limit integer default 20
)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  first_name text,
  country text,
  city text,
  nationality text,
  preferred_host_countries text[],
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  age integer,
  children_info text,
  will_care_for_elderly boolean,
  will_care_for_pets boolean,
  primary_photo_path text,
  activity_status text,
  verification_status text,
  created_at timestamptz
)
language sql
security definer
volatile
set search_path = ''
as $$
  with rate_gate as materialized (
    select public.reserve_profile_search_request(60) as allowed
  ),
  viewer as (
    select viewer_profile.id, viewer_profile.account_type
    from public.profiles viewer_profile
    cross join rate_gate
    where viewer_profile.id = (select auth.uid())
      and rate_gate.allowed
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
  ),
  normalized as (
    select
      public.profile_discovery_normalize_text(p_query) as query,
      pg_catalog.regexp_split_to_array(
        public.profile_discovery_normalize_text(p_query),
        '\s+'
      ) as terms
  ),
  candidates as (
    select
      target_profile.*,
      public.profile_discovery_search_text(
        target_profile.full_name,
        target_profile.first_name,
        target_profile.city,
        target_profile.country,
        target_profile.nationality,
        target_profile.preferred_host_countries,
        target_profile.mother_tongue,
        target_profile.fluent_languages,
        target_profile.basic_languages,
        target_profile.children_info,
        target_profile.will_care_for_elderly,
        target_profile.will_care_for_pets
      ) as haystack,
      viewer.id as viewer_id,
      normalized.query,
      normalized.terms
    from viewer
    join public.profiles target_profile
      on target_profile.account_type = case
        when viewer.account_type = 'family' then 'au_pair'
        when viewer.account_type = 'au_pair' then 'family'
        else null
      end
    cross join normalized
    where pg_catalog.char_length(normalized.query) between 2 and 64
      and target_profile.onboarding_completed = true
      and target_profile.public_slug is not null
      and target_profile.suspended_at is null
      and target_profile.deletion_requested_at is null
      and target_profile.deletion_scheduled_at is null
      and target_profile.content_moderation_status = 'approved'
      and coalesce(target_profile.is_admin, false) = false
      and not public.profile_pair_blocked(viewer.id, target_profile.id)
  )
  select
    candidate.id,
    candidate.public_slug,
    candidate.account_type,
    candidate.full_name,
    candidate.first_name,
    candidate.country,
    candidate.city,
    candidate.nationality,
    candidate.preferred_host_countries,
    candidate.mother_tongue,
    candidate.fluent_languages,
    candidate.basic_languages,
    case
      when coalesce(candidate.birth_date, candidate.date_of_birth) is null
        then null
      else pg_catalog.date_part(
        'year',
        pg_catalog.age(
          current_date,
          coalesce(candidate.birth_date, candidate.date_of_birth)
        )
      )::integer
    end as age,
    candidate.children_info,
    candidate.will_care_for_elderly,
    candidate.will_care_for_pets,
    primary_photo.storage_path,
    public.profile_activity_status(candidate.last_active_at),
    candidate.verification_status,
    candidate.created_at
  from candidates candidate
  join lateral (
    select photo.storage_path
    from public.profile_photos photo
    where photo.profile_id = candidate.id
    order by photo.is_primary desc, photo.sort_order, photo.created_at
    limit 1
  ) primary_photo on true
  where candidate.haystack like '%' || candidate.terms[1] || '%'
    and not exists (
      select 1
      from unnest(candidate.terms) term
      where candidate.haystack not like '%' || term || '%'
    )
  order by
    case
      when public.profile_discovery_normalize_text(
        coalesce(candidate.first_name, candidate.full_name, '')
      )
        like candidate.query || '%' then 0
      when public.profile_discovery_normalize_text(
        coalesce(candidate.full_name, '')
      )
        like '%' || candidate.query || '%' then 1
      when public.profile_discovery_normalize_text(
        coalesce(candidate.city, '')
      )
        like candidate.query || '%' then 2
      else 3
    end,
    case public.profile_activity_status(candidate.last_active_at)
      when 'active' then 0
      when 'recently_active' then 1
      else 2
    end,
    candidate.last_active_at desc nulls last,
    candidate.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;

revoke all on function public.search_profile_cards(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.search_profile_cards(text, integer)
to authenticated;

-- Message autocomplete is a projection of the same bounded discovery query.
-- This prevents authenticated clients from bypassing the route-level limiter
-- by invoking the RPC directly.
create or replace function public.get_message_profile_suggestions(
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
volatile
set search_path = ''
as $$
  select
    card.id,
    card.public_slug,
    card.account_type,
    card.full_name,
    card.country,
    card.city,
    card.primary_photo_path,
    card.activity_status,
    card.verification_status
  from public.search_profile_cards(
    p_query,
    least(greatest(coalesce(p_limit, 12), 1), 12)
  ) card;
$$;

revoke all on function public.get_message_profile_suggestions(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_message_profile_suggestions(text, integer)
to authenticated;

drop index if exists public.profiles_message_autocomplete_trgm_idx;

-- Legacy browse RPCs still support the public filter pages. Cap the cost of an
-- individual direct call even before those pages move to fully DB-paginated
-- filtering.
alter function public.get_au_pair_search_cards()
set statement_timeout = '2s';
alter function public.get_family_search_cards()
set statement_timeout = '2s';
