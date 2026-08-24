alter table public.profiles
add column if not exists suspended_at timestamptz,
add column if not exists suspended_reason text,
add column if not exists suspended_by uuid references public.profiles(id) on delete set null;

create index if not exists profiles_suspended_at_idx
on public.profiles (suspended_at)
where suspended_at is not null;

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  subject_type text not null check (subject_type in ('profile', 'story', 'conversation')),
  subject_id uuid not null,
  reported_profile_id uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 80),
  details text not null default '' check (char_length(details) <= 1200),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  admin_notes text not null default '' check (char_length(admin_notes) <= 1200),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

alter table public.moderation_reports enable row level security;

create index if not exists moderation_reports_status_created_at_idx
on public.moderation_reports (status, created_at desc);

create policy "Users can create their own moderation reports"
on public.moderation_reports
for insert
to authenticated
with check (reporter_id = (select auth.uid()));

create policy "Users can view their own moderation reports"
on public.moderation_reports
for select
to authenticated
using (reporter_id = (select auth.uid()));

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := (select auth.uid());
begin
  if v_sender_id is null then
    return new;
  end if;

  if (
    select count(*)
    from public.messages m
    where m.sender_id = v_sender_id
      and m.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Please slow down before sending more messages.';
  end if;

  if (
    select count(*)
    from public.messages m
    where m.sender_id = v_sender_id
      and m.created_at > now() - interval '1 hour'
  ) >= 120 then
    raise exception 'You have sent many messages recently. Please try again later.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_message_rate_limit_trigger on public.messages;

create trigger enforce_message_rate_limit_trigger
before insert on public.messages
for each row
execute function public.enforce_message_rate_limit();

create or replace function public.enforce_story_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := (select auth.uid());
begin
  if v_profile_id is null then
    return new;
  end if;

  if new.profile_id <> v_profile_id then
    return new;
  end if;

  if (
    select count(*)
    from public.profile_stories s
    where s.profile_id = v_profile_id
      and s.created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Please wait before posting more stories.';
  end if;

  if (
    select count(*)
    from public.profile_stories s
    where s.profile_id = v_profile_id
      and s.expires_at > now()
  ) >= 12 then
    raise exception 'You have many active stories already. Please delete one before posting another.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_story_rate_limit_trigger on public.profile_stories;

create trigger enforce_story_rate_limit_trigger
before insert on public.profile_stories
for each row
execute function public.enforce_story_rate_limit();

create or replace function public.enforce_profile_photo_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := (select auth.uid());
begin
  if v_profile_id is null then
    return new;
  end if;

  if new.profile_id <> v_profile_id then
    return new;
  end if;

  if (
    select count(*)
    from public.profile_photos pp
    where pp.profile_id = v_profile_id
      and pp.created_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Please wait before uploading more profile photos.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_photo_rate_limit_trigger on public.profile_photos;

create trigger enforce_profile_photo_rate_limit_trigger
before insert on public.profile_photos
for each row
execute function public.enforce_profile_photo_rate_limit();

create or replace function public.get_au_pair_search_cards()
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
    and p.suspended_at is null
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

create or replace function public.get_family_search_cards()
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
    and p.suspended_at is null
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

create or replace function public.get_public_profile(p_profile_id uuid)
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
    and p.suspended_at is null
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

create or replace function public.get_public_profile_by_identifier(p_identifier text)
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
        and p.suspended_at is null
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
  limit 1;
$$;

grant execute on function public.get_au_pair_search_cards() to anon, authenticated;
grant execute on function public.get_family_search_cards() to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.get_public_profile_by_identifier(text) to anon, authenticated;
grant execute on function public.get_active_story_cards(text) to anon, authenticated;
grant execute on function public.get_public_story(uuid) to anon, authenticated;
