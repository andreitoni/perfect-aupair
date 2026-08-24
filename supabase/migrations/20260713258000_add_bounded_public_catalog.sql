-- Keep public discovery reads bounded, deterministic, and available only to
-- server-side service-role callers. Browser clients must go through the app,
-- where the fixed-cardinality request budget is reserved before these RPCs.

create index if not exists profiles_public_catalog_created_idx
on public.profiles (account_type, created_at desc, id desc)
where onboarding_completed = true
  and public_slug is not null
  and suspended_at is null
  and deletion_requested_at is null
  and deletion_scheduled_at is null
  and content_moderation_status = 'approved'
  and coalesce(is_admin, false) = false;

create index if not exists profiles_public_catalog_country_idx
on public.profiles (account_type, country, created_at desc, id desc)
where onboarding_completed = true
  and public_slug is not null
  and suspended_at is null
  and deletion_requested_at is null
  and deletion_scheduled_at is null
  and content_moderation_status = 'approved'
  and coalesce(is_admin, false) = false;

create index if not exists profiles_public_catalog_activity_idx
on public.profiles (account_type, last_active_at desc, created_at desc, id desc)
where onboarding_completed = true
  and public_slug is not null
  and suspended_at is null
  and deletion_requested_at is null
  and deletion_scheduled_at is null
  and content_moderation_status = 'approved'
  and coalesce(is_admin, false) = false;

create index if not exists profile_photos_public_catalog_idx
on public.profile_photos (
  profile_id,
  is_primary desc,
  sort_order asc,
  created_at asc,
  id asc
)
include (storage_path);

create index if not exists profile_videos_public_approved_idx
on public.profile_videos (profile_id)
where content_moderation_status = 'approved';

create index if not exists profile_stories_public_active_idx
on public.profile_stories (profile_id, expires_at desc, created_at desc)
where content_moderation_status = 'approved';

create index if not exists profile_stories_public_rail_idx
on public.profile_stories (created_at desc, id desc)
include (profile_id, storage_path, expires_at)
where content_moderation_status = 'approved';

-- Exactly 7,872 rows are preallocated: three request scopes multiplied by
-- 2,048 IP slots, 512 prefix slots, and 64 independent global shards. The
-- service role has read-only inspection access and the RPC never inserts rows,
-- so attacker-controlled identifiers cannot grow this table. With 64 global
-- shards, the aggregate ceilings are 1,024 search, 2,048 count, and 512
-- landing reservations per minute.
create table if not exists public.public_catalog_request_counters (
  request_scope text not null,
  counter_kind text not null,
  slot_no smallint not null,
  window_started_at timestamptz not null default to_timestamp(0),
  request_count integer not null default 0,
  primary key (request_scope, counter_kind, slot_no),
  constraint public_catalog_request_counters_scope_check
    check (request_scope in ('search', 'count', 'landing')),
  constraint public_catalog_request_counters_kind_check
    check (counter_kind in ('ip', 'prefix', 'global_shard')),
  constraint public_catalog_request_counters_slot_check check (
    (counter_kind = 'ip' and slot_no between 0 and 2047)
    or (counter_kind = 'prefix' and slot_no between 0 and 511)
    or (counter_kind = 'global_shard' and slot_no between 0 and 63)
  ),
  constraint public_catalog_request_counters_count_check
    check (request_count >= 0)
);

alter table public.public_catalog_request_counters enable row level security;
revoke all on table public.public_catalog_request_counters
from public, anon, authenticated, service_role;
grant select on table public.public_catalog_request_counters to service_role;

insert into public.public_catalog_request_counters (
  request_scope,
  counter_kind,
  slot_no
)
select request_scope, slot_group.counter_kind, slot_group.slot_no::smallint
from unnest(array['search', 'count', 'landing']) as request_scope
cross join lateral (
  select 'ip'::text as counter_kind, generate_series(0, 2047) as slot_no
  union all
  select 'prefix', generate_series(0, 511)
  union all
  select 'global_shard', generate_series(0, 63)
) slot_group
on conflict (request_scope, counter_kind, slot_no) do nothing;

create or replace function public.reserve_public_catalog_request(
  p_ip_hash text,
  p_ip_prefix_hash text,
  p_scope text
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '1s'
set lock_timeout = '250ms'
as $$
declare
  v_window_started_at timestamptz := date_trunc('minute', clock_timestamp());
  v_ip_slot smallint;
  v_prefix_slot smallint;
  v_global_slot smallint;
  v_ip_count integer;
  v_prefix_count integer;
  v_global_count integer;
  v_ip_limit integer;
  v_prefix_limit integer;
  v_global_limit integer;
  v_retry_after integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_scope not in ('search', 'count', 'landing')
    or coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_ip_prefix_hash, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid public catalog rate-limit input'
      using errcode = '22023';
  end if;

  case p_scope
    when 'search' then
      v_ip_limit := 16;
      v_prefix_limit := 256;
      v_global_limit := 16;
    when 'count' then
      v_ip_limit := 32;
      v_prefix_limit := 512;
      v_global_limit := 32;
    when 'landing' then
      v_ip_limit := 8;
      v_prefix_limit := 128;
      v_global_limit := 8;
  end case;

  v_ip_slot := (
    (hashtextextended(p_scope || ':ip:' || p_ip_hash, 0)
      & 9223372036854775807) % 2048
  )::smallint;
  v_prefix_slot := (
    (hashtextextended(p_scope || ':prefix:' || p_ip_prefix_hash, 0)
      & 9223372036854775807) % 512
  )::smallint;
  v_global_slot := (
    (hashtextextended(p_scope || ':global:' || p_ip_hash, 0)
      & 9223372036854775807) % 64
  )::smallint;

  -- A single, consistent lock order prevents cross-request deadlocks. Global
  -- traffic is split over 64 rows, so there is no global hot lock.
  update public.public_catalog_request_counters as counter
  set
    request_count = case
      when counter.window_started_at = v_window_started_at
        then counter.request_count + 1
      else 1
    end,
    window_started_at = v_window_started_at
  where counter.request_scope = p_scope
    and counter.counter_kind = 'global_shard'
    and counter.slot_no = v_global_slot
  returning counter.request_count into v_global_count;

  update public.public_catalog_request_counters as counter
  set
    request_count = case
      when counter.window_started_at = v_window_started_at
        then counter.request_count + 1
      else 1
    end,
    window_started_at = v_window_started_at
  where counter.request_scope = p_scope
    and counter.counter_kind = 'prefix'
    and counter.slot_no = v_prefix_slot
  returning counter.request_count into v_prefix_count;

  update public.public_catalog_request_counters as counter
  set
    request_count = case
      when counter.window_started_at = v_window_started_at
        then counter.request_count + 1
      else 1
    end,
    window_started_at = v_window_started_at
  where counter.request_scope = p_scope
    and counter.counter_kind = 'ip'
    and counter.slot_no = v_ip_slot
  returning counter.request_count into v_ip_count;

  if v_global_count is null or v_prefix_count is null or v_ip_count is null then
    raise exception 'Public catalog rate-limit slot unavailable';
  end if;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (
      v_window_started_at + interval '1 minute' - clock_timestamp()
    )))::integer
  );

  return query
  select
    v_global_count <= v_global_limit
      and v_prefix_count <= v_prefix_limit
      and v_ip_count <= v_ip_limit,
    case
      when v_global_count <= v_global_limit
        and v_prefix_count <= v_prefix_limit
        and v_ip_count <= v_ip_limit
      then 0
      else v_retry_after
    end;
end;
$$;

revoke all on function public.reserve_public_catalog_request(text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_public_catalog_request(text, text, text)
to service_role;

-- The former story-card RPC trusted auth.uid() and was callable directly by
-- browsers. Remove that path; all story rails now use the bounded service RPC.
revoke all on function public.get_active_story_cards(text)
from public, anon, authenticated, service_role;

create or replace function public.get_bounded_public_story_cards(
  p_account_type text,
  p_viewer_id uuid default null
)
returns table (
  id uuid,
  profile_id uuid,
  full_name text,
  account_type text,
  city text,
  country text,
  storage_path text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '2s'
set lock_timeout = '250ms'
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_account_type not in ('family', 'au_pair') then
    return;
  end if;

  return query
  with viewer as materialized (
    select
      profile.id,
      profile.account_type,
      coalesce(profile.is_admin, false) as is_admin
    from public.profiles profile
    where p_viewer_id is not null
      and profile.id = p_viewer_id
      and profile.suspended_at is null
      and profile.deletion_requested_at is null
      and profile.deletion_scheduled_at is null
      and (
        coalesce(profile.is_admin, false)
        or public.public_profile_is_eligible(profile.id, true)
      )
    limit 1
  )
  select
    story.id,
    owner_profile.id,
    owner_profile.full_name,
    owner_profile.account_type,
    owner_profile.city,
    owner_profile.country,
    case when p_viewer_id is null then null else story.storage_path end,
    story.created_at,
    story.expires_at
  from public.profile_stories story
  join public.profiles owner_profile on owner_profile.id = story.profile_id
  where public.database_feature_flag_enabled('stories')
    and owner_profile.account_type = p_account_type
    and story.expires_at > clock_timestamp()
    and story.content_moderation_status = 'approved'
    and public.public_profile_is_eligible(owner_profile.id, true)
    and (
      p_viewer_id is null
      or exists (
        select 1
        from viewer
        where (
          viewer.is_admin
          or viewer.account_type <> owner_profile.account_type
        )
          and not exists (
            select 1
            from public.profile_blocks block
            where (
              block.blocker_id = viewer.id
              and block.blocked_profile_id = owner_profile.id
            ) or (
              block.blocker_id = owner_profile.id
              and block.blocked_profile_id = viewer.id
            )
          )
      )
    )
  order by story.created_at desc, story.id desc
  limit 20;
end;
$$;

revoke all on function public.get_bounded_public_story_cards(text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_bounded_public_story_cards(text, uuid)
to service_role;

-- The unbounded legacy profile-card RPCs are no longer part of the runtime
-- surface, including for the service role.
revoke all on function public.get_au_pair_search_cards()
from public, anon, authenticated, service_role;
revoke all on function public.get_family_search_cards()
from public, anon, authenticated, service_role;

create or replace function public.get_bounded_public_profile_cards(
  p_account_type text,
  p_filters jsonb default '{}'::jsonb,
  p_viewer_id uuid default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 12,
  p_guest_page_limit integer default null,
  p_include_countries boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '3s'
set lock_timeout = '250ms'
as $$
declare
  v_filters jsonb;
  v_now timestamptz := clock_timestamp();
  v_sort text;
  v_page integer;
  v_page_size integer;
  v_guest_page_limit integer;
  v_include_countries boolean;
  v_viewer_account_type text;
  v_viewer_valid boolean := false;
  v_country text;
  v_start_from date;
  v_start_to date;
  v_duration_min integer;
  v_duration_max integer;
  v_activity text;
  v_smoking text;
  v_gender text;
  v_age_min integer;
  v_age_max integer;
  v_already_in_germany boolean := false;
  v_will_care_for_elderly boolean := false;
  v_will_care_for_pets boolean := false;
  v_children text;
  v_allowance_min numeric;
  v_allowance_currency text;
  v_require_video boolean := false;
  v_value text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_account_type not in ('family', 'au_pair') then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'current_page', 1,
      'total_pages', 1,
      'page_size', 12,
      'countries', '[]'::jsonb,
      'total_is_capped', false
    );
  end if;

  v_filters := case
    when jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) = 'object'
      then coalesce(p_filters, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_sort := case
    when p_sort in ('newest', 'oldest', 'recently_active') then p_sort
    else 'newest'
  end;
  v_page := least(100, greatest(1, coalesce(p_page, 1)));
  v_page_size := least(24, greatest(1, coalesce(p_page_size, 12)));
  v_guest_page_limit := least(
    2,
    greatest(1, coalesce(p_guest_page_limit, 2))
  );
  v_include_countries := coalesce(p_include_countries, true);

  v_country := nullif(left(btrim(coalesce(v_filters ->> 'country', '')), 100), '');
  v_activity := nullif(left(btrim(coalesce(v_filters ->> 'activity', '')), 100), '');
  v_smoking := nullif(left(btrim(coalesce(v_filters ->> 'smoking', '')), 100), '');
  v_gender := nullif(left(btrim(coalesce(v_filters ->> 'gender', '')), 100), '');
  v_children := nullif(left(btrim(coalesce(v_filters ->> 'children', '')), 100), '');
  v_allowance_currency := nullif(
    left(btrim(coalesce(v_filters ->> 'allowanceCurrency', '')), 100),
    ''
  );

  if v_smoking not in ('smoker', 'non_smoker') then
    v_smoking := null;
  end if;
  if v_gender not in ('female', 'male') then
    v_gender := null;
  end if;
  if v_children not in ('1 child', '2 children', '3+ children') then
    v_children := null;
  end if;

  v_value := btrim(coalesce(v_filters ->> 'startFrom', ''));
  if v_value ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    if substring(v_value from 1 for 4)::integer between 1 and 9999 then
      v_start_from := (v_value || '-01')::date;
    end if;
  end if;
  v_value := btrim(coalesce(v_filters ->> 'startTo', ''));
  if v_value ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    if substring(v_value from 1 for 4)::integer between 1 and 9999 then
      v_start_to := (v_value || '-01')::date;
    end if;
  end if;

  v_value := btrim(coalesce(v_filters ->> 'durationMin', ''));
  if v_value ~ '^[0-9]{1,9}$' then
    v_duration_min := v_value::integer;
    if v_duration_min <= 0 then
      v_duration_min := null;
    end if;
  end if;
  v_value := btrim(coalesce(v_filters ->> 'durationMax', ''));
  if v_value ~ '^[0-9]{1,9}$' then
    v_duration_max := v_value::integer;
    if v_duration_max <= 0 then
      v_duration_max := null;
    end if;
  end if;

  v_value := btrim(coalesce(v_filters ->> 'ageMin', ''));
  if v_value ~ '^[0-9]{1,9}$' then
    v_age_min := v_value::integer;
    if v_age_min <= 0 then
      v_age_min := null;
    end if;
  end if;
  v_value := btrim(coalesce(v_filters ->> 'ageMax', ''));
  if v_value ~ '^[0-9]{1,9}$' then
    v_age_max := v_value::integer;
    if v_age_max <= 0 then
      v_age_max := null;
    end if;
  end if;

  v_value := btrim(coalesce(v_filters ->> 'allowanceMin', ''));
  if v_value ~ '^[0-9]{1,9}([.][0-9]{1,2})?$' then
    v_allowance_min := v_value::numeric;
    if v_allowance_min <= 0 then
      v_allowance_min := null;
    end if;
  end if;
  if v_allowance_min is not null
    and coalesce(v_allowance_currency, 'EUR') not in ('EUR', 'GBP', 'USD')
  then
    v_allowance_min := null;
    v_allowance_currency := null;
  end if;

  v_already_in_germany := coalesce(v_filters ->> 'alreadyInGermany', '')
    in ('1', 'true', 'on');
  v_will_care_for_elderly := coalesce(v_filters ->> 'willCareForElderly', '')
    in ('1', 'true', 'on');
  v_will_care_for_pets := coalesce(v_filters ->> 'willCareForPets', '')
    in ('1', 'true', 'on');
  v_require_video := coalesce(v_filters ->> 'has_video', '')
    in ('1', 'true', 'on');

  if p_viewer_id is null then
    v_viewer_valid := true;
  else
    select viewer.account_type
    into v_viewer_account_type
    from public.profiles viewer
    where viewer.id = p_viewer_id
      and viewer.onboarding_completed = true
      and viewer.suspended_at is null
      and viewer.deletion_requested_at is null
      and viewer.deletion_scheduled_at is null
    limit 1;
    v_viewer_valid := found;
  end if;

  return (
    with filtered as materialized (
      select
        profile.id,
        profile.public_slug,
        profile.created_at,
        profile.account_type,
        profile.full_name,
        profile.first_name,
        profile.country,
        profile.city,
        profile.nationality,
        profile.preferred_host_countries,
        profile.mother_tongue,
        profile.fluent_languages,
        profile.basic_languages,
        profile.availability_start,
        profile.availability_start_from,
        profile.availability_start_to,
        profile.duration,
        profile.duration_min_months,
        profile.duration_max_months,
        profile.smoking_status,
        profile.gender,
        profile.religion,
        profile.already_in_germany,
        case
          when coalesce(profile.birth_date, profile.date_of_birth) is null
            then null
          else date_part(
            'year',
            age(current_date, coalesce(profile.birth_date, profile.date_of_birth))
          )::integer
        end as age,
        profile.bio,
        profile.childcare_experience,
        profile.has_drivers_license,
        profile.has_childcare_experience,
        profile.has_infant_experience,
        profile.has_first_aid,
        profile.will_care_for_elderly,
        profile.will_care_for_pets,
        profile.children_info,
        profile.au_pair_allowance_amount,
        profile.au_pair_allowance_currency,
        profile.accommodation_info,
        profile.expectations,
        profile.verification_status,
        case
          when profile.last_active_at >= v_now - interval '30 minutes' then 2
          when profile.last_active_at >= v_now - interval '24 hours' then 1
          else 0
        end as activity_rank,
        case
          when profile.last_active_at >= v_now - interval '30 minutes'
            then 'active'
          when profile.last_active_at >= v_now - interval '24 hours'
            then 'recently_active'
          else null
        end as activity_status,
        media.has_story,
        media.has_video
      from public.profiles profile
      cross join lateral (
        select
          public.database_feature_flag_enabled('stories') and exists (
            select 1
            from public.profile_stories story
            where story.profile_id = profile.id
              and story.content_moderation_status = 'approved'
              and story.expires_at > v_now
          ) as has_story,
          exists (
            select 1
            from public.profile_videos video
            where video.profile_id = profile.id
              and video.content_moderation_status = 'approved'
          ) as has_video
      ) media
      where v_viewer_valid
        and profile.account_type = p_account_type
        and profile.onboarding_completed = true
        and profile.public_slug is not null
        and profile.suspended_at is null
        and profile.deletion_requested_at is null
        and profile.deletion_scheduled_at is null
        and profile.content_moderation_status = 'approved'
        and coalesce(profile.is_admin, false) = false
        and exists (
          select 1
          from public.profile_photos eligibility_photo
          where eligibility_photo.profile_id = profile.id
        )
        and (
          p_viewer_id is null
          or (
            profile.id <> p_viewer_id
            and profile.account_type <> v_viewer_account_type
            and not exists (
              select 1
              from public.profile_blocks block
              where (
                block.blocker_id = p_viewer_id
                and block.blocked_profile_id = profile.id
              ) or (
                block.blocker_id = profile.id
                and block.blocked_profile_id = p_viewer_id
              )
            )
          )
        )
        and (v_country is null or profile.country = v_country)
        and (
          (v_start_from is null and v_start_to is null)
          or profile.availability_start_from is null
          or profile.availability_start_to is null
          or (
            profile.availability_start_from <= coalesce(v_start_to, v_start_from)
            and profile.availability_start_to >= coalesce(v_start_from, v_start_to)
          )
        )
        and (
          (v_duration_min is null and v_duration_max is null)
          or profile.duration_min_months is null
          or profile.duration_max_months is null
          or (
            profile.duration_min_months <= coalesce(v_duration_max, 24)
            and profile.duration_max_months >= coalesce(v_duration_min, 1)
          )
        )
        and (
          p_account_type <> 'au_pair'
          or v_smoking is null
          or profile.smoking_status = v_smoking
        )
        and (
          p_account_type <> 'au_pair'
          or v_gender is null
          or profile.gender = v_gender
        )
        and (
          p_account_type <> 'au_pair'
          or (v_age_min is null and v_age_max is null)
          or (
            coalesce(profile.birth_date, profile.date_of_birth) is not null
            and (
              v_age_min is null
              or date_part(
                'year',
                age(current_date, coalesce(profile.birth_date, profile.date_of_birth))
              )::integer >= v_age_min
            )
            and (
              v_age_max is null
              or date_part(
                'year',
                age(current_date, coalesce(profile.birth_date, profile.date_of_birth))
              )::integer <= v_age_max
            )
          )
        )
        and (
          v_activity is null
          or v_activity not in ('active', 'recently_active')
          or (
            v_activity = 'active'
            and profile.last_active_at >= v_now - interval '30 minutes'
          )
          or (
            v_activity = 'recently_active'
            and profile.last_active_at >= v_now - interval '24 hours'
          )
        )
        and (
          p_account_type <> 'au_pair'
          or not v_already_in_germany
          or profile.already_in_germany = true
        )
        and (
          p_account_type <> 'au_pair'
          or not v_will_care_for_elderly
          or profile.will_care_for_elderly = true
        )
        and (
          p_account_type <> 'au_pair'
          or not v_will_care_for_pets
          or profile.will_care_for_pets = true
        )
        and (
          p_account_type <> 'family'
          or v_children is null
          or profile.children_info = v_children
        )
        and (
          p_account_type <> 'family'
          or v_allowance_min is null
          or (
            profile.au_pair_allowance_amount is not null
            and profile.au_pair_allowance_amount > 0
            and profile.au_pair_allowance_amount * case
              when profile.au_pair_allowance_currency = 'EUR' then 1::numeric
              when profile.au_pair_allowance_currency = 'GBP' then 1.17::numeric
              when profile.au_pair_allowance_currency = 'USD' then 0.92::numeric
              else null
            end >= v_allowance_min * case
              when coalesce(v_allowance_currency, 'EUR') = 'EUR' then 1::numeric
              when v_allowance_currency = 'GBP' then 1.17::numeric
              when v_allowance_currency = 'USD' then 0.92::numeric
              else null
            end
          )
        )
        and (not v_require_video or media.has_video)
      order by
        case when v_sort = 'recently_active' then
          case
            when profile.last_active_at >= v_now - interval '30 minutes' then 2
            when profile.last_active_at >= v_now - interval '24 hours' then 1
            else 0
          end
        end desc,
        case when v_sort = 'oldest' then profile.created_at end asc,
        case when v_sort in ('newest', 'recently_active')
          then profile.created_at
        end desc,
        case when v_sort = 'oldest' then profile.id end asc,
        case when v_sort in ('newest', 'recently_active') then profile.id end desc
      limit (v_page_size * 100) + 1
    ),
    ranked as materialized (
      select
        filtered.*,
        row_number() over (
          order by
            case when v_sort = 'recently_active' then filtered.activity_rank end desc,
            case when v_sort = 'oldest' then filtered.created_at end asc,
            case when v_sort in ('newest', 'recently_active')
              then filtered.created_at
            end desc,
            case when v_sort = 'oldest' then filtered.id end asc,
            case when v_sort in ('newest', 'recently_active')
              then filtered.id
            end desc
        ) as catalog_row
      from filtered
    ),
    stats as (
      select
        least(count(*)::integer, v_page_size * 100) as bounded_total,
        count(*) > (v_page_size * 100) as total_is_capped
      from filtered
    ),
    paging as (
      select
        stats.bounded_total,
        stats.total_is_capped,
        least(
          100,
          greatest(
            1,
            ceil(stats.bounded_total::numeric / v_page_size::numeric)::integer
          )
        ) as total_pages
      from stats
    ),
    page_state as (
      select
        paging.*,
        least(v_page, paging.total_pages) as current_page
      from paging
    ),
    items as (
      select
        ranked.catalog_row,
        jsonb_build_object(
          'id', ranked.id,
          'public_slug', ranked.public_slug,
          'created_at', ranked.created_at,
          'account_type', ranked.account_type,
          'full_name', ranked.full_name,
          'first_name', ranked.first_name,
          'country', ranked.country,
          'city', ranked.city,
          'nationality', ranked.nationality,
          'preferred_host_countries', ranked.preferred_host_countries,
          'mother_tongue', ranked.mother_tongue,
          'fluent_languages', ranked.fluent_languages,
          'basic_languages', ranked.basic_languages,
          'availability_start', ranked.availability_start,
          'availability_start_from', ranked.availability_start_from,
          'availability_start_to', ranked.availability_start_to,
          'duration', ranked.duration,
          'duration_min_months', ranked.duration_min_months,
          'duration_max_months', ranked.duration_max_months,
          'smoking_status', ranked.smoking_status,
          'gender', ranked.gender,
          'religion', ranked.religion,
          'already_in_germany', ranked.already_in_germany,
          'age', ranked.age,
          'bio', ranked.bio,
          'childcare_experience', ranked.childcare_experience,
          'has_drivers_license', ranked.has_drivers_license,
          'has_childcare_experience', ranked.has_childcare_experience,
          'has_infant_experience', ranked.has_infant_experience,
          'has_first_aid', ranked.has_first_aid,
          'will_care_for_elderly', ranked.will_care_for_elderly,
          'will_care_for_pets', ranked.will_care_for_pets,
          'children_info', ranked.children_info,
          'au_pair_allowance_amount', ranked.au_pair_allowance_amount,
          'au_pair_allowance_currency', ranked.au_pair_allowance_currency,
          'accommodation_info', ranked.accommodation_info,
          'expectations', ranked.expectations,
          'primary_photo_path', photo.primary_photo_path,
          'photo_count', photo.photo_count,
          'activity_status', ranked.activity_status,
          'verification_status', ranked.verification_status,
          'has_story', ranked.has_story,
          'has_video', ranked.has_video
        ) as item
      from ranked
      cross join page_state
      cross join lateral (
        select
          count(*)::bigint as photo_count,
          (array_agg(
            profile_photo.storage_path
            order by
              profile_photo.is_primary desc,
              profile_photo.sort_order asc,
              profile_photo.created_at asc,
              profile_photo.id asc
          ))[1] as primary_photo_path
        from public.profile_photos profile_photo
        where profile_photo.profile_id = ranked.id
      ) photo
      where ranked.catalog_row >
          ((page_state.current_page - 1) * v_page_size)
        and ranked.catalog_row <=
          (page_state.current_page * v_page_size)
        and not (
          p_viewer_id is null
          and page_state.current_page > v_guest_page_limit
        )
    ),
    country_values as materialized (
      select distinct profile.country
      from public.profiles profile
      where v_include_countries
        and v_viewer_valid
        and profile.account_type = p_account_type
        and profile.country is not null
        and btrim(profile.country) <> ''
        and profile.onboarding_completed = true
        and profile.public_slug is not null
        and profile.suspended_at is null
        and profile.deletion_requested_at is null
        and profile.deletion_scheduled_at is null
        and profile.content_moderation_status = 'approved'
        and coalesce(profile.is_admin, false) = false
        and exists (
          select 1
          from public.profile_photos eligibility_photo
          where eligibility_photo.profile_id = profile.id
        )
        and (
          p_viewer_id is null
          or (
            profile.id <> p_viewer_id
            and profile.account_type <> v_viewer_account_type
            and not exists (
              select 1
              from public.profile_blocks block
              where (
                block.blocker_id = p_viewer_id
                and block.blocked_profile_id = profile.id
              ) or (
                block.blocker_id = profile.id
                and block.blocked_profile_id = p_viewer_id
              )
            )
          )
        )
      order by profile.country
      limit 256
    )
    select jsonb_build_object(
      'items', coalesce(
        (select jsonb_agg(items.item order by items.catalog_row) from items),
        '[]'::jsonb
      ),
      'total', page_state.bounded_total,
      'current_page', page_state.current_page,
      'total_pages', page_state.total_pages,
      'page_size', v_page_size,
      'countries', coalesce(
        (
          select jsonb_agg(country_values.country order by country_values.country)
          from country_values
        ),
        '[]'::jsonb
      ),
      'total_is_capped', page_state.total_is_capped
    )
    from page_state
  );
end;
$$;

revoke all on function public.get_bounded_public_profile_cards(
  text,
  jsonb,
  uuid,
  text,
  integer,
  integer,
  integer,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.get_bounded_public_profile_cards(
  text,
  jsonb,
  uuid,
  text,
  integer,
  integer,
  integer,
  boolean
) to service_role;

create or replace function public.get_featured_public_profile_cards(
  p_limit integer default 5
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '2s'
set lock_timeout = '250ms'
as $$
declare
  v_limit integer := least(5, greatest(1, coalesce(p_limit, 5)));
  v_au_pair_target integer;
  v_family_target integer;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  v_au_pair_target := ceil(v_limit::numeric * 0.60)::integer;
  v_family_target := v_limit - v_au_pair_target;

  return (
    with au_pair_candidates as materialized (
      select profile.id, profile.account_type, profile.created_at
      from public.profiles profile
      where profile.account_type = 'au_pair'
        and profile.onboarding_completed = true
        and profile.public_slug is not null
        and profile.suspended_at is null
        and profile.deletion_requested_at is null
        and profile.deletion_scheduled_at is null
        and profile.content_moderation_status = 'approved'
        and coalesce(profile.is_admin, false) = false
        and exists (
          select 1
          from public.profile_photos eligibility_photo
          where eligibility_photo.profile_id = profile.id
        )
      order by profile.created_at desc, profile.id desc
      limit 5
    ),
    family_candidates as materialized (
      select profile.id, profile.account_type, profile.created_at
      from public.profiles profile
      where profile.account_type = 'family'
        and profile.onboarding_completed = true
        and profile.public_slug is not null
        and profile.suspended_at is null
        and profile.deletion_requested_at is null
        and profile.deletion_scheduled_at is null
        and profile.content_moderation_status = 'approved'
        and coalesce(profile.is_admin, false) = false
        and exists (
          select 1
          from public.profile_photos eligibility_photo
          where eligibility_photo.profile_id = profile.id
        )
      order by profile.created_at desc, profile.id desc
      limit 5
    ),
    candidates as materialized (
      select * from au_pair_candidates
      union all
      select * from family_candidates
    ),
    ranked_candidates as materialized (
      select
        candidates.*,
        row_number() over (
          partition by candidates.account_type
          order by candidates.created_at desc, candidates.id desc
        ) as type_rank
      from candidates
    ),
    preferred as materialized (
      select ranked_candidates.*
      from ranked_candidates
      where (
        ranked_candidates.account_type = 'au_pair'
        and ranked_candidates.type_rank <= v_au_pair_target
      ) or (
        ranked_candidates.account_type = 'family'
        and ranked_candidates.type_rank <= v_family_target
      )
    ),
    fallback as materialized (
      select ranked_candidates.*
      from ranked_candidates
      where not exists (
        select 1
        from preferred
        where preferred.id = ranked_candidates.id
      )
      order by ranked_candidates.created_at desc, ranked_candidates.id desc
      limit (
        select greatest(0, v_limit - count(*)::integer)
        from preferred
      )
    ),
    chosen as materialized (
      select preferred.id, preferred.created_at from preferred
      union all
      select fallback.id, fallback.created_at from fallback
    ),
    items as (
      select
        chosen.created_at,
        chosen.id as chosen_id,
        jsonb_build_object(
          'id', profile.id,
          'public_slug', profile.public_slug,
          'created_at', profile.created_at,
          'account_type', profile.account_type,
          'full_name', profile.full_name,
          'first_name', profile.first_name,
          'country', profile.country,
          'city', profile.city,
          'nationality', profile.nationality,
          'preferred_host_countries', profile.preferred_host_countries,
          'mother_tongue', profile.mother_tongue,
          'fluent_languages', profile.fluent_languages,
          'basic_languages', profile.basic_languages,
          'availability_start', profile.availability_start,
          'availability_start_from', profile.availability_start_from,
          'availability_start_to', profile.availability_start_to,
          'duration', profile.duration,
          'duration_min_months', profile.duration_min_months,
          'duration_max_months', profile.duration_max_months,
          'smoking_status', profile.smoking_status,
          'gender', profile.gender,
          'religion', profile.religion,
          'already_in_germany', profile.already_in_germany,
          'age', case
            when coalesce(profile.birth_date, profile.date_of_birth) is null
              then null
            else date_part(
              'year',
              age(current_date, coalesce(profile.birth_date, profile.date_of_birth))
            )::integer
          end,
          'bio', profile.bio,
          'childcare_experience', profile.childcare_experience,
          'has_drivers_license', profile.has_drivers_license,
          'has_childcare_experience', profile.has_childcare_experience,
          'has_infant_experience', profile.has_infant_experience,
          'has_first_aid', profile.has_first_aid,
          'will_care_for_elderly', profile.will_care_for_elderly,
          'will_care_for_pets', profile.will_care_for_pets,
          'children_info', profile.children_info,
          'au_pair_allowance_amount', profile.au_pair_allowance_amount,
          'au_pair_allowance_currency', profile.au_pair_allowance_currency,
          'accommodation_info', profile.accommodation_info,
          'expectations', profile.expectations,
          'primary_photo_path', photo.primary_photo_path,
          'photo_count', photo.photo_count,
          'activity_status', case
            when profile.last_active_at >= v_now - interval '30 minutes'
              then 'active'
            when profile.last_active_at >= v_now - interval '24 hours'
              then 'recently_active'
            else null
          end,
          'verification_status', profile.verification_status,
          'has_story', public.database_feature_flag_enabled('stories') and exists (
            select 1
            from public.profile_stories story
            where story.profile_id = profile.id
              and story.content_moderation_status = 'approved'
              and story.expires_at > v_now
          ),
          'has_video', exists (
            select 1
            from public.profile_videos video
            where video.profile_id = profile.id
              and video.content_moderation_status = 'approved'
          )
        ) as item
      from chosen
      join public.profiles profile on profile.id = chosen.id
      cross join lateral (
        select
          count(*)::bigint as photo_count,
          (array_agg(
            profile_photo.storage_path
            order by
              profile_photo.is_primary desc,
              profile_photo.sort_order asc,
              profile_photo.created_at asc,
              profile_photo.id asc
          ))[1] as primary_photo_path
        from public.profile_photos profile_photo
        where profile_photo.profile_id = profile.id
      ) photo
    )
    select jsonb_build_object(
      'items', coalesce(
        jsonb_agg(items.item order by items.created_at desc, items.chosen_id desc),
        '[]'::jsonb
      )
    )
    from items
  );
end;
$$;

revoke all on function public.get_featured_public_profile_cards(integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_featured_public_profile_cards(integer)
to service_role;

create or replace function public.get_bounded_public_profile_sitemap_entries(
  p_limit integer default 5000
)
returns table (
  id uuid,
  public_slug text
)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
set lock_timeout = '250ms'
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  select profile.id, profile.public_slug
  from public.profiles profile
  where profile.onboarding_completed = true
    and profile.public_slug is not null
    and profile.suspended_at is null
    and profile.deletion_requested_at is null
    and profile.deletion_scheduled_at is null
    and profile.content_moderation_status = 'approved'
    and coalesce(profile.is_admin, false) = false
    and exists (
      select 1
      from public.profile_photos eligibility_photo
      where eligibility_photo.profile_id = profile.id
    )
  order by profile.created_at desc, profile.id desc
  limit least(5000, greatest(1, coalesce(p_limit, 5000)));
end;
$$;

revoke all on function public.get_bounded_public_profile_sitemap_entries(integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_bounded_public_profile_sitemap_entries(integer)
to service_role;
