-- Rank the default public catalog by profile quality, bounded engagement,
-- activity, freshness, and discovery. Explicit chronological sorts remain intact.
-- No demographic or appearance attribute contributes to this ranking.

create index if not exists profile_favorites_profile_created_idx
on public.profile_favorites (profile_id, created_at desc);

create index if not exists conversations_family_created_idx
on public.conversations (family_id, created_at desc);

create index if not exists conversations_au_pair_created_idx
on public.conversations (au_pair_id, created_at desc);

create table if not exists public.profile_catalog_exposures (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  impression_count bigint not null default 0 check (impression_count >= 0),
  ranking_impression_count bigint not null default 0
    check (ranking_impression_count >= 0),
  ranking_day date not null default current_date,
  last_impressed_at timestamptz not null default now()
);

alter table public.profile_catalog_exposures enable row level security;
revoke all on table public.profile_catalog_exposures
from public, anon, authenticated;
grant all on table public.profile_catalog_exposures to service_role;

create or replace function public.get_bounded_public_profile_cards(
  p_account_type text,
  p_filters jsonb default '{}'::jsonb,
  p_viewer_id uuid default null,
  p_sort text default 'recommended',
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
  v_result jsonb;
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
    when p_sort in ('recommended', 'newest', 'oldest', 'recently_active')
      then p_sort
    else 'recommended'
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

  with scored as materialized (
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
        media.has_video,
        recommendation.recommendation_score,
        recommendation.rotation_score
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
          ) as has_video,
          (
            select count(*)::integer
            from public.profile_photos profile_photo
            where profile_photo.profile_id = profile.id
          ) as photo_count
      ) media
      cross join lateral (
        select
          case
            when media.photo_count >= 4 then 12
            else media.photo_count * 3
          end
          + case
              when char_length(btrim(coalesce(profile.bio, ''))) >= 300 then 7
              when char_length(btrim(coalesce(profile.bio, ''))) >= 120 then 5
              when char_length(btrim(coalesce(profile.bio, ''))) >= 50 then 2
              else 0
            end
          + case
              when nullif(btrim(coalesce(profile.country, '')), '') is not null
                and nullif(btrim(coalesce(profile.city, '')), '') is not null
                then 2
              when nullif(btrim(coalesce(profile.country, '')), '') is not null
                or nullif(btrim(coalesce(profile.city, '')), '') is not null
                then 1
              else 0
            end
          + case
              when nullif(btrim(coalesce(profile.mother_tongue, '')), '') is not null
                or coalesce(cardinality(profile.fluent_languages), 0) > 0
                or coalesce(cardinality(profile.basic_languages), 0) > 0
                then 2
              else 0
            end
          + case
              when profile.availability_start_from is not null
                and profile.availability_start_to is not null
                then 1
              else 0
            end
          + case
              when profile.duration_min_months is not null
                and profile.duration_max_months is not null
                then 1
              else 0
            end
          + case
              when profile.account_type = 'au_pair'
                and (
                  char_length(btrim(coalesce(profile.childcare_experience, ''))) >= 40
                  or profile.has_childcare_experience = true
                )
                then 1
              when profile.account_type = 'family'
                and nullif(btrim(coalesce(profile.children_info, '')), '') is not null
                then 1
              else 0
            end
          + case
              when profile.account_type = 'au_pair'
                and (
                  coalesce(cardinality(profile.preferred_host_countries), 0) > 0
                  or profile.has_drivers_license = true
                  or profile.has_infant_experience = true
                  or profile.has_first_aid = true
                )
                then 1
              when profile.account_type = 'family'
                and (
                  char_length(btrim(coalesce(profile.accommodation_info, ''))) >= 40
                  or char_length(btrim(coalesce(profile.expectations, ''))) >= 40
                )
                then 1
              else 0
            end
          + case when media.has_video then 2 else 0 end
          + case when profile.verification_status = 'verified' then 1 else 0 end
          as quality_score
      ) quality
      cross join lateral (
        select
          (
            select count(*)::bigint
            from public.profile_views profile_view
            where v_sort = 'recommended'
              and profile_view.profile_id = profile.id
              and profile_view.last_viewed_at >= v_now - interval '30 days'
          ) as unique_view_count,
          (
            select count(*)::bigint
            from public.profile_favorites favorite
            where v_sort = 'recommended'
              and favorite.profile_id = profile.id
              and favorite.created_at >= v_now - interval '30 days'
          ) as favorite_count,
          (
            select count(*)::bigint
            from public.conversations conversation
            where v_sort = 'recommended'
              and conversation.created_at >= v_now - interval '30 days'
              and (
                (profile.account_type = 'family' and conversation.family_id = profile.id)
                or (
                  profile.account_type = 'au_pair'
                  and conversation.au_pair_id = profile.id
                )
              )
          ) as conversation_count
      ) engagement
      cross join lateral (
        select coalesce(
          (
            select case
              when catalog_exposure.ranking_day = current_date
                then catalog_exposure.ranking_impression_count
              else catalog_exposure.impression_count
            end
            from public.profile_catalog_exposures catalog_exposure
            where catalog_exposure.profile_id = profile.id
          ),
          0::bigint
        ) as ranking_impression_count
      ) exposure
      cross join lateral (
        select
          least(10::bigint, engagement.unique_view_count)::integer
          + least(8::bigint, engagement.favorite_count * 2)::integer
          + least(7::bigint, engagement.conversation_count * 3)::integer
            as engagement_score,
          case
            when profile.last_active_at >= v_now - interval '30 minutes' then 15
            when profile.last_active_at >= v_now - interval '24 hours' then 10
            when profile.last_active_at >= v_now - interval '7 days' then 4
            else 0
          end as activity_score,
          case
            when profile.created_at >= v_now - interval '3 days' then 15
            when profile.created_at >= v_now - interval '7 days' then 10
            when profile.created_at >= v_now - interval '14 days' then 5
            else 0
          end as freshness_score,
          case
            when quality.quality_score >= 20
              and exposure.ranking_impression_count < 24
              then 15
            when quality.quality_score >= 18
              and exposure.ranking_impression_count < 72
              then 10
            when quality.quality_score >= 15
              and exposure.ranking_impression_count < 144
              then 5
            else 0
          end as discovery_score
      ) components
      cross join lateral (
        select
          (
            quality.quality_score
            + components.engagement_score
            + components.activity_score
            + components.freshness_score
            + components.discovery_score
          )::integer as recommendation_score,
          (
            (
              (
                pg_catalog.hashtextextended(
                  profile.id::text
                  || ':' || coalesce(p_viewer_id::text, 'guest')
                  || ':' || current_date::text,
                  0
                ) % 401
              ) + 401
            ) % 401
          )::integer as rotation_score
      ) recommendation
      where v_viewer_valid
        and profile.account_type = p_account_type
        and profile.onboarding_completed = true
        and profile.public_slug is not null
        and profile.suspended_at is null
        and profile.deletion_requested_at is null
        and profile.deletion_scheduled_at is null
        and profile.content_moderation_status = 'approved'
        and coalesce(profile.is_admin, false) = false
        and media.photo_count > 0
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
    ),
    filtered as materialized (
      select scored.*
      from scored
      order by
        case when v_sort = 'recommended'
          then scored.recommendation_score
        end desc,
        case when v_sort = 'recommended' then scored.rotation_score end desc,
        case when v_sort = 'recently_active' then
          scored.activity_rank
        end desc,
        case when v_sort = 'oldest' then scored.created_at end asc,
        case when v_sort in ('newest', 'recently_active')
          then scored.created_at
        end desc,
        case when v_sort = 'oldest' then scored.id end asc,
        case when v_sort in ('recommended', 'newest', 'recently_active')
          then scored.id
        end desc
      limit (v_page_size * 100) + 1
    ),
    ranked as materialized (
      select
        filtered.*,
        row_number() over (
          order by
            case when v_sort = 'recommended'
              then filtered.recommendation_score
            end desc,
            case when v_sort = 'recommended'
              then filtered.rotation_score
            end desc,
            case when v_sort = 'recently_active' then filtered.activity_rank end desc,
            case when v_sort = 'oldest' then filtered.created_at end asc,
            case when v_sort in ('newest', 'recently_active')
              then filtered.created_at
            end desc,
            case when v_sort = 'oldest' then filtered.id end asc,
            case when v_sort in ('recommended', 'newest', 'recently_active')
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
    into v_result
    from page_state;

  insert into public.profile_catalog_exposures (
    profile_id,
    impression_count,
    ranking_impression_count,
    ranking_day,
    last_impressed_at
  )
  select
    (catalog_item ->> 'id')::uuid,
    1,
    0,
    current_date,
    v_now
  from jsonb_array_elements(
    coalesce(v_result -> 'items', '[]'::jsonb)
  ) catalog_item
  on conflict (profile_id) do update
  set
    impression_count = case
      when public.profile_catalog_exposures.impression_count
        < 9223372036854775807::bigint
        then public.profile_catalog_exposures.impression_count + 1
      else public.profile_catalog_exposures.impression_count
    end,
    ranking_impression_count = case
      when public.profile_catalog_exposures.ranking_day = current_date
        then public.profile_catalog_exposures.ranking_impression_count
      else public.profile_catalog_exposures.impression_count
    end,
    ranking_day = current_date,
    last_impressed_at = v_now;

  return v_result;
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
