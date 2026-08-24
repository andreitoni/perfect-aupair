alter table public.profiles
add column if not exists availability_start_from date,
add column if not exists availability_start_to date,
add column if not exists duration_min_months integer,
add column if not exists duration_max_months integer;

alter table public.profiles
drop constraint if exists profiles_availability_window_valid;

alter table public.profiles
add constraint profiles_availability_window_valid
check (
  availability_start_from is null
  or availability_start_to is null
  or availability_start_to >= availability_start_from
);

alter table public.profiles
drop constraint if exists profiles_duration_window_valid;

alter table public.profiles
add constraint profiles_duration_window_valid
check (
  duration_min_months is null
  or duration_max_months is null
  or (
    duration_min_months between 1 and 24
    and duration_max_months between 1 and 24
    and duration_max_months >= duration_min_months
  )
);

update public.profiles
set
  availability_start_from = case
    when availability_start_from is not null then availability_start_from
    when availability_start in ('Now', 'As soon as possible', 'Immediately', 'Flexible') then date_trunc('month', current_date)::date
    when availability_start = 'In 1–3 months' then (date_trunc('month', current_date) + interval '1 month')::date
    when availability_start in ('In 3–6 months', 'In 4–6 months') then (date_trunc('month', current_date) + interval '4 months')::date
    when availability_start = 'In 7–12 months' then (date_trunc('month', current_date) + interval '7 months')::date
    else date_trunc('month', current_date)::date
  end,
  availability_start_to = case
    when availability_start_to is not null then availability_start_to
    when availability_start in ('Now', 'As soon as possible', 'Immediately') then date_trunc('month', current_date)::date
    when availability_start = 'Flexible' then (date_trunc('month', current_date) + interval '12 months')::date
    when availability_start = 'In 1–3 months' then (date_trunc('month', current_date) + interval '3 months')::date
    when availability_start in ('In 3–6 months', 'In 4–6 months') then (date_trunc('month', current_date) + interval '6 months')::date
    when availability_start = 'In 7–12 months' then (date_trunc('month', current_date) + interval '12 months')::date
    else (date_trunc('month', current_date) + interval '12 months')::date
  end,
  duration_min_months = case
    when duration_min_months is not null then duration_min_months
    when duration = '1–3 months' then 1
    when duration in ('3–6 months', '4–6 months') then 4
    when duration in ('6–12 months', '7–12 months') then 7
    when duration = '12+ months' then 12
    when duration = 'Flexible' then 1
    else 1
  end,
  duration_max_months = case
    when duration_max_months is not null then duration_max_months
    when duration = '1–3 months' then 3
    when duration in ('3–6 months', '4–6 months') then 6
    when duration in ('6–12 months', '7–12 months') then 12
    when duration = '12+ months' then 24
    when duration = 'Flexible' then 24
    else 24
  end;

drop function if exists public.get_au_pair_search_cards();
drop function if exists public.get_family_search_cards();

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
    p.bio,
    primary_photo.storage_path
  order by p.created_at desc;
$$;

create function public.get_family_search_cards()
returns table (
  id uuid,
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
    count(ph.id) as photo_count
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
  group by
    p.id,
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
    primary_photo.storage_path
  order by p.created_at desc;
$$;

grant execute on function public.get_au_pair_search_cards() to anon, authenticated;
grant execute on function public.get_family_search_cards() to anon, authenticated;
