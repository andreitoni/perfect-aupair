-- Temporary admin-controlled ordering for the recommended public catalog.
-- Overrides expire automatically and do not change profile data or other sorts.

create table if not exists public.profile_catalog_ranking_overrides (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  priority integer not null check (priority between 1 and 1000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint profile_catalog_ranking_overrides_dates_check
    check (expires_at > starts_at)
);

alter table public.profile_catalog_ranking_overrides enable row level security;
revoke all on table public.profile_catalog_ranking_overrides
from public, anon, authenticated;
grant all on table public.profile_catalog_ranking_overrides to service_role;

do $$
declare
  v_function_definition text;
begin
  -- Patch the existing ranking function without duplicating its large body.
  select pg_get_functiondef(
    'public.get_bounded_public_profile_cards(text,jsonb,uuid,text,integer,integer,integer,boolean)'::regprocedure
  ) into v_function_definition;

  v_function_definition := replace(
    v_function_definition,
    E'recommendation.recommendation_score,\n        recommendation.rotation_score',
    E'recommendation.recommendation_score,\n        recommendation.rotation_score,\n        coalesce(ranking_override.priority, 1001) as ranking_priority'
  );

  v_function_definition := replace(
    v_function_definition,
    E'      from public.profiles profile\n      cross join lateral (',
    E'      from public.profiles profile\n      left join public.profile_catalog_ranking_overrides ranking_override\n        on ranking_override.profile_id = profile.id\n        and ranking_override.starts_at <= v_now\n        and ranking_override.expires_at > v_now\n      cross join lateral ('
  );

  v_function_definition := replace(
    v_function_definition,
    E'case when v_sort = ''recommended''\n          then scored.recommendation_score\n        end desc,',
    E'case when v_sort = ''recommended'' then scored.ranking_priority end asc,\n        case when v_sort = ''recommended''\n          then scored.recommendation_score\n        end desc,'
  );

  v_function_definition := replace(
    v_function_definition,
    E'case when v_sort = ''recommended''\n              then filtered.recommendation_score\n            end desc,',
    E'case when v_sort = ''recommended'' then filtered.ranking_priority end asc,\n            case when v_sort = ''recommended''\n              then filtered.recommendation_score\n            end desc,'
  );

  if position('ranking_priority' in v_function_definition) = 0 then
    raise exception 'Could not patch the public catalog ranking function.';
  end if;

  execute v_function_definition;
end;
$$;
