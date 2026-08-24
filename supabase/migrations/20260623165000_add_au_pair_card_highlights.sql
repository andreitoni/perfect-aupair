alter table public.profiles
  add column if not exists has_drivers_license boolean not null default false,
  add column if not exists has_childcare_experience boolean not null default false,
  add column if not exists has_infant_experience boolean not null default false,
  add column if not exists has_first_aid boolean not null default false;

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

grant execute on function public.get_au_pair_search_cards() to anon, authenticated;
