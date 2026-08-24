alter table public.profiles
add column if not exists gender text,
add column if not exists birth_date date;

alter table public.profiles
drop constraint if exists profiles_gender_valid;

alter table public.profiles
add constraint profiles_gender_valid
check (
  gender is null
  or gender in ('female', 'male')
);

update public.profiles
set birth_date = date_of_birth
where account_type = 'au_pair'
  and birth_date is null
  and date_of_birth is not null;

drop function if exists public.get_au_pair_search_cards();

create function public.get_au_pair_search_cards()
returns table (
  id uuid,
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
  birth_date date,
  age integer,
  bio text,
  primary_photo_path text,
  photo_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
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
    coalesce(p.birth_date, p.date_of_birth) as birth_date,
    case
      when coalesce(p.birth_date, p.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(p.birth_date, p.date_of_birth)))::integer
    end as age,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count
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
  group by
    p.id,
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
    primary_photo.storage_path
  order by p.created_at desc;
$$;

grant execute on function public.get_au_pair_search_cards() to anon, authenticated;
