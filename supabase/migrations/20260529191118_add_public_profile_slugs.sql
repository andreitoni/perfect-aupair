alter table public.profiles
add column if not exists public_slug text;

create unique index if not exists profiles_public_slug_key
on public.profiles (public_slug)
where public_slug is not null;

create or replace function public.profile_slug_base(
  p_full_name text,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_city text,
  p_account_type text
)
returns text
language plpgsql
immutable
as $$
declare
  v_raw text;
  v_base text;
begin
  v_raw := coalesce(
    nullif(trim(p_full_name), ''),
    nullif(trim(p_display_name), ''),
    nullif(trim(concat_ws(' ', p_first_name, p_last_name)), ''),
    nullif(trim(concat_ws(' ', p_account_type, p_city)), ''),
    'profile'
  );

  v_base := lower(v_raw);
  v_base := translate(
    v_base,
    'ăâîșşțţáàäåãéèëêíìïóòöôõúùüûñç',
    'aaisssttaaaaaeeeeiiiooooouuuunc'
  );
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '(^-+|-+$)', '', 'g');

  if length(v_base) < 3 then
    v_base := 'profile';
  end if;

  return left(v_base, 48);
end;
$$;

create or replace function public.generate_unique_profile_slug(
  p_profile_id uuid,
  p_full_name text,
  p_display_name text,
  p_first_name text,
  p_last_name text,
  p_city text,
  p_account_type text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
begin
  v_base := public.profile_slug_base(
    p_full_name,
    p_display_name,
    p_first_name,
    p_last_name,
    p_city,
    p_account_type
  );

  loop
    v_candidate := v_base || '-' || substring(
      md5(p_profile_id::text || random()::text || clock_timestamp()::text),
      1,
      6
    );

    exit when not exists (
      select 1
      from public.profiles p
      where p.public_slug = v_candidate
        and p.id <> p_profile_id
    );
  end loop;

  return v_candidate;
end;
$$;

create or replace function public.ensure_profile_public_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.public_slug is null and new.onboarding_completed = true then
    new.public_slug := public.generate_unique_profile_slug(
      new.id,
      new.full_name,
      new.display_name,
      new.first_name,
      new.last_name,
      new.city,
      new.account_type
    );
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_profile_public_slug_trigger on public.profiles;

create trigger ensure_profile_public_slug_trigger
before insert or update of onboarding_completed, full_name, display_name, first_name, last_name, city, account_type
on public.profiles
for each row
execute function public.ensure_profile_public_slug();

update public.profiles p
set public_slug = public.generate_unique_profile_slug(
  p.id,
  p.full_name,
  p.display_name,
  p.first_name,
  p.last_name,
  p.city,
  p.account_type
)
where p.public_slug is null
  and p.onboarding_completed = true;

drop function if exists public.get_au_pair_search_cards();
drop function if exists public.get_family_search_cards();
drop function if exists public.get_public_profile(uuid);
drop function if exists public.get_public_profile_by_identifier(text);

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
  photo_count bigint
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
    and p.public_slug is not null
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
  photo_count bigint
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
    and p.public_slug is not null
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
  photo_count bigint
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
  where p.id = p_profile_id
    and p.onboarding_completed = true
    and p.public_slug is not null
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
  photo_count bigint
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.get_public_profile(
    (
      select p.id
      from public.profiles p
      where p.onboarding_completed = true
        and (
          p.public_slug = p_identifier
          or (
            p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and p.id = p_identifier::uuid
          )
        )
      limit 1
    )
  );
$$;
