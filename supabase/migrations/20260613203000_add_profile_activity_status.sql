alter table public.profiles
add column if not exists last_active_at timestamptz;

create index if not exists profiles_last_active_at_idx
on public.profiles (last_active_at desc)
where last_active_at is not null;

update public.profiles
set last_active_at = coalesce(last_active_at, updated_at, created_at)
where last_active_at is null
  and onboarding_completed = true;

create or replace function public.profile_activity_status(p_last_active_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_last_active_at >= now() - interval '10 minutes' then 'active'
    when p_last_active_at >= now() - interval '24 hours' then 'recently_active'
    else null
  end;
$$;

drop function if exists public.get_public_profile_by_identifier(text);
drop function if exists public.get_public_profile(uuid);
drop function if exists public.get_au_pair_search_cards();
drop function if exists public.get_family_search_cards();

create function public.get_au_pair_search_cards()
returns table (
  id uuid,
  public_slug text,
  full_name text,
  country text,
  city text,
  nationality text,
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
  age integer,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.public_slug,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
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
    case
      when coalesce(p.birth_date, p.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(p.birth_date, p.date_of_birth)))::integer
    end as age,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status
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
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
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
    p.birth_date,
    p.date_of_birth,
    p.bio,
    p.last_active_at,
    primary_photo.storage_path
  order by p.created_at desc;
$$;

create function public.get_family_search_cards()
returns table (
  id uuid,
  public_slug text,
  full_name text,
  country text,
  city text,
  children_info text,
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.public_slug,
    p.full_name,
    p.country,
    p.city,
    p.children_info,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.accommodation_info,
    p.expectations,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status
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
  where p.account_type = 'family'
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.full_name,
    p.country,
    p.city,
    p.children_info,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.accommodation_info,
    p.expectations,
    p.bio,
    p.last_active_at,
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
  age integer,
  children_info text,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text
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
    case
      when coalesce(p.birth_date, p.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(p.birth_date, p.date_of_birth)))::integer
    end as age,
    p.children_info,
    p.accommodation_info,
    p.expectations,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status
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
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
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
    p.birth_date,
    p.date_of_birth,
    p.children_info,
    p.accommodation_info,
    p.expectations,
    p.bio,
    p.last_active_at,
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
  age integer,
  children_info text,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id
    into v_profile_id
    from public.profiles p
    where p.onboarding_completed = true
      and p.suspended_at is null
      and coalesce(p.is_admin, false) = false
      and (p.public_slug = p_identifier or p.id = p_identifier::uuid)
    limit 1;
  else
    select p.id
    into v_profile_id
    from public.profiles p
    where p.onboarding_completed = true
      and p.suspended_at is null
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
