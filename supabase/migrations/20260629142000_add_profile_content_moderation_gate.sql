alter table public.profiles
add column if not exists content_moderation_status text not null default 'pending',
add column if not exists content_moderation_reviewed_at timestamptz,
add column if not exists content_moderation_reviewed_by uuid references public.profiles(id) on delete set null,
add column if not exists content_moderation_reason text;

alter table public.profiles
drop constraint if exists profiles_content_moderation_status_valid;

alter table public.profiles
add constraint profiles_content_moderation_status_valid
check (content_moderation_status in ('pending', 'approved', 'rejected'));

create index if not exists profiles_content_moderation_status_idx
on public.profiles (content_moderation_status, created_at desc)
where coalesce(is_admin, false) = false;

update public.profiles
set
  content_moderation_status = 'approved',
  content_moderation_reviewed_at = coalesce(content_moderation_reviewed_at, now()),
  content_moderation_reason = coalesce(
    content_moderation_reason,
    'Existing profile approved during content moderation rollout.'
  )
where content_moderation_status = 'pending';

create or replace function public.mark_profile_public_content_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_actor_role = 'service_role' then
    return new;
  end if;

  if coalesce(new.is_admin, false) then
    return new;
  end if;

  if
    old.full_name is distinct from new.full_name
    or old.first_name is distinct from new.first_name
    or old.last_name is distinct from new.last_name
    or old.bio is distinct from new.bio
    or old.children_info is distinct from new.children_info
    or old.accommodation_info is distinct from new.accommodation_info
    or old.expectations is distinct from new.expectations
  then
    new.content_moderation_status := 'pending';
    new.content_moderation_reviewed_at := null;
    new.content_moderation_reviewed_by := null;
    new.content_moderation_reason := 'Public profile text changed and needs content review.';
  end if;

  return new;
end;
$$;

drop trigger if exists mark_profile_public_content_pending_trigger
on public.profiles;

create trigger mark_profile_public_content_pending_trigger
before update of full_name, first_name, last_name, bio, children_info, accommodation_info, expectations
on public.profiles
for each row
execute function public.mark_profile_public_content_pending();

create or replace function public.mark_profile_photo_content_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_profile_id uuid;
begin
  if v_actor_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;

  v_profile_id := new.profile_id;

  update public.profiles
  set
    content_moderation_status = 'pending',
    content_moderation_reviewed_at = null,
    content_moderation_reviewed_by = null,
    content_moderation_reason = 'Profile photo changed and needs content review.'
  where id = v_profile_id
    and coalesce(is_admin, false) = false;

  return new;
end;
$$;

drop trigger if exists mark_profile_photo_content_pending_trigger
on public.profile_photos;

create trigger mark_profile_photo_content_pending_trigger
after insert or update of storage_path on public.profile_photos
for each row
execute function public.mark_profile_photo_content_pending();

create or replace function public.get_au_pair_search_cards()
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
    and p.content_moderation_status = 'approved'
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

create or replace function public.get_family_search_cards()
returns table (
  id uuid,
  public_slug text,
  created_at timestamptz,
  full_name text,
  country text,
  city text,
  religion text,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
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
    p.country,
    p.city,
    p.religion,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
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
  where p.account_type = 'family'
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and p.content_moderation_status = 'approved'
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.created_at,
    p.full_name,
    p.country,
    p.city,
    p.religion,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
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
    p.verification_status,
    primary_photo.storage_path
  order by p.created_at desc;
$$;

create or replace function public.get_public_profile(p_profile_id uuid)
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
  already_in_germany boolean,
  age integer,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
  accommodation_info text,
  expectations text,
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
  where p.id = p_profile_id
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and p.content_moderation_status = 'approved'
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
    p.already_in_germany,
    p.birth_date,
    p.date_of_birth,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
    p.accommodation_info,
    p.expectations,
    p.bio,
    p.childcare_experience,
    p.has_drivers_license,
    p.has_childcare_experience,
    p.has_infant_experience,
    p.has_first_aid,
    p.last_active_at,
    p.verification_status,
    primary_photo.storage_path
  limit 1;
$$;

create or replace function public.get_public_profile_by_identifier(p_identifier text)
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
  already_in_germany boolean,
  age integer,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
  accommodation_info text,
  expectations text,
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
      and p.content_moderation_status = 'approved'
      and coalesce(p.is_admin, false) = false
      and exists (
        select 1
        from public.profile_photos ph
        where ph.profile_id = p.id
      )
      and (p.public_slug = p_identifier or p.id = p_identifier::uuid)
    limit 1;
  else
    select p.id
    into v_profile_id
    from public.profiles p
    where p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and p.content_moderation_status = 'approved'
      and coalesce(p.is_admin, false) = false
      and exists (
        select 1
        from public.profile_photos ph
        where ph.profile_id = p.id
      )
      and p.public_slug = p_identifier
    limit 1;
  end if;

  return query
  select *
  from public.get_public_profile(v_profile_id);
end;
$$;

create or replace function public.get_active_story_cards(p_account_type text)
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
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    p.id as profile_id,
    p.full_name,
    p.account_type,
    p.city,
    p.country,
    s.storage_path,
    s.created_at,
    s.expires_at
  from public.profile_stories s
  join public.profiles p
    on p.id = s.profile_id
  where s.expires_at > now()
    and p.onboarding_completed = true
    and p.suspended_at is null
    and p.content_moderation_status = 'approved'
    and coalesce(p.is_admin, false) = false
    and exists (
      select 1
      from public.profile_photos ph
      where ph.profile_id = p.id
    )
    and p.account_type = p_account_type
  order by s.created_at desc
  limit 20;
$$;

create or replace function public.get_public_story(p_story_id uuid)
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
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    p.id as profile_id,
    p.full_name,
    p.account_type,
    p.city,
    p.country,
    s.storage_path,
    s.created_at,
    s.expires_at
  from public.profile_stories s
  join public.profiles p
    on p.id = s.profile_id
  where s.id = p_story_id
    and s.expires_at > now()
    and p.onboarding_completed = true
    and p.suspended_at is null
    and p.content_moderation_status = 'approved'
    and coalesce(p.is_admin, false) = false
    and exists (
      select 1
      from public.profile_photos ph
      where ph.profile_id = p.id
    )
  limit 1;
$$;

grant execute on function public.get_au_pair_search_cards() to anon, authenticated;
grant execute on function public.get_family_search_cards() to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.get_public_profile_by_identifier(text) to anon, authenticated;
grant execute on function public.get_active_story_cards(text) to anon, authenticated;
grant execute on function public.get_public_story(uuid) to anon, authenticated;
