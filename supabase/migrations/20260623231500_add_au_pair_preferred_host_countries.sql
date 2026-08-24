alter table public.profiles
  add column if not exists preferred_host_countries text[] not null default '{}';

with ranked_au_pairs as (
  select
    id,
    row_number() over (order by created_at asc, id asc) as row_number
  from public.profiles
  where account_type = 'au_pair'
    and onboarding_completed = true
    and coalesce(cardinality(preferred_host_countries), 0) = 0
)
update public.profiles p
set preferred_host_countries =
  case mod(r.row_number, 6)
    when 0 then array['Germany', 'United Kingdom', 'United States']
    when 1 then array['Germany', 'France', 'Spain']
    when 2 then array['United States', 'Canada', 'United Kingdom']
    when 3 then array['Austria', 'Germany', 'Netherlands']
    when 4 then array['Italy', 'Spain', 'France']
    else array['Sweden', 'Denmark', 'Germany']
  end
from ranked_au_pairs r
where p.id = r.id;

alter table public.profiles
  drop constraint if exists profiles_preferred_host_countries_count;

alter table public.profiles
  add constraint profiles_preferred_host_countries_count
  check (
    cardinality(preferred_host_countries) <= 6
    and (
      account_type <> 'au_pair'
      or onboarding_completed is not true
      or cardinality(preferred_host_countries) >= 1
    )
  );

drop function if exists public.get_public_profile_by_identifier(text);
drop function if exists public.get_public_profile(uuid);
drop function if exists public.get_au_pair_search_cards();

create function public.get_au_pair_search_cards()
returns table (
  id uuid,
  public_slug text,
  created_at timestamptz,
  full_name text,
  first_name text,
  country text,
  city text,
  nationality text,
  preferred_host_countries text[],
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  smoking_status text,
  gender text,
  religion text,
  height_cm integer,
  weight_kg integer,
  already_in_germany boolean,
  age integer,
  bio text,
  childcare_experience text,
  has_drivers_license boolean,
  has_childcare_experience boolean,
  has_infant_experience boolean,
  has_first_aid boolean,
  primary_photo_path text,
  photo_count bigint,
  activity_status text,
  verification_status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.public_slug,
    p.created_at,
    p.full_name,
    p.first_name,
    p.country,
    p.city,
    p.nationality,
    p.preferred_host_countries,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    p.religion,
    p.height_cm,
    p.weight_kg,
    p.already_in_germany,
    case
      when coalesce(p.birth_date, p.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(p.birth_date, p.date_of_birth)))::integer
    end as age,
    p.bio,
    p.childcare_experience,
    p.has_drivers_license,
    p.has_childcare_experience,
    p.has_infant_experience,
    p.has_first_aid,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status,
    p.verification_status
  from public.profiles p
  join public.profile_photos ph
    on ph.profile_id = p.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where p.account_type = 'au_pair'
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.created_at,
    p.full_name,
    p.first_name,
    p.country,
    p.city,
    p.nationality,
    p.preferred_host_countries,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    p.religion,
    p.height_cm,
    p.weight_kg,
    p.already_in_germany,
    p.birth_date,
    p.date_of_birth,
    p.bio,
    p.childcare_experience,
    p.has_drivers_license,
    p.has_childcare_experience,
    p.has_infant_experience,
    p.has_first_aid,
    p.last_active_at,
    p.verification_status,
    primary_photo.storage_path
  order by p.created_at desc;
$$;

create function public.get_public_profile(p_profile_id uuid)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  country text,
  city text,
  nationality text,
  preferred_host_countries text[],
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  smoking_status text,
  gender text,
  religion text,
  height_cm integer,
  weight_kg integer,
  already_in_germany boolean,
  age integer,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text,
  verification_status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.public_slug,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.preferred_host_countries,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    p.religion,
    p.height_cm,
    p.weight_kg,
    p.already_in_germany,
    case
      when coalesce(p.birth_date, p.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(p.birth_date, p.date_of_birth)))::integer
    end as age,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
    p.accommodation_info,
    p.expectations,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status,
    p.verification_status
  from public.profiles p
  left join public.profile_photos ph
    on ph.profile_id = p.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where p.id = p_profile_id
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.preferred_host_countries,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    p.religion,
    p.height_cm,
    p.weight_kg,
    p.already_in_germany,
    p.birth_date,
    p.date_of_birth,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
    p.accommodation_info,
    p.expectations,
    p.bio,
    p.last_active_at,
    p.verification_status,
    primary_photo.storage_path
  limit 1;
$$;

create function public.get_public_profile_by_identifier(p_identifier text)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  country text,
  city text,
  nationality text,
  preferred_host_countries text[],
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  smoking_status text,
  gender text,
  religion text,
  height_cm integer,
  weight_kg integer,
  already_in_germany boolean,
  age integer,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text,
  verification_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id
    into v_profile_id
    from public.profiles p
    where p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
      and (p.public_slug = p_identifier or p.id = p_identifier::uuid)
    limit 1;
  else
    select p.id
    into v_profile_id
    from public.profiles p
    where p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
      and p.public_slug = p_identifier
    limit 1;
  end if;

  return query
  select *
  from public.get_public_profile(v_profile_id);
end;
$$;

grant execute on function public.get_au_pair_search_cards() to anon, authenticated;
grant execute on function public.get_family_search_cards() to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.get_public_profile_by_identifier(text) to anon, authenticated;
