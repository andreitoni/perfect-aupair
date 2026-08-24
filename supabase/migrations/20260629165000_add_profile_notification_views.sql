create table if not exists public.profile_views (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  view_count integer not null default 1 check (view_count > 0),
  constraint profile_views_no_self_view check (viewer_id <> profile_id),
  constraint profile_views_unique_viewer_profile unique (viewer_id, profile_id)
);

alter table public.profile_views enable row level security;

drop policy if exists "Users can read profile views they received" on public.profile_views;
create policy "Users can read profile views they received"
on public.profile_views
for select
to authenticated
using (profile_id = (select auth.uid()));

create index if not exists profile_views_profile_last_viewed_idx
on public.profile_views (profile_id, last_viewed_at desc);

create index if not exists profile_views_viewer_last_viewed_idx
on public.profile_views (viewer_id, last_viewed_at desc);

revoke all on table public.profile_views from anon, authenticated;
grant select on public.profile_views to authenticated;
grant all on public.profile_views to service_role;

create or replace function public.record_profile_view(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer record;
  v_target record;
begin
  if v_viewer_id is null or p_profile_id is null or v_viewer_id = p_profile_id then
    return;
  end if;

  select
    p.id,
    p.account_type,
    p.onboarding_completed,
    p.suspended_at,
    p.deletion_requested_at,
    p.content_moderation_status,
    p.is_admin
  into v_viewer
  from public.profiles p
  where p.id = v_viewer_id;

  select
    p.id,
    p.account_type,
    p.onboarding_completed,
    p.suspended_at,
    p.deletion_requested_at,
    p.content_moderation_status,
    p.is_admin,
    p.public_slug
  into v_target
  from public.profiles p
  where p.id = p_profile_id;

  if v_viewer.id is null or v_target.id is null then
    return;
  end if;

  if coalesce(v_viewer.is_admin, false) or coalesce(v_target.is_admin, false) then
    return;
  end if;

  if not coalesce(v_viewer.onboarding_completed, false)
    or not coalesce(v_target.onboarding_completed, false)
    or v_viewer.account_type is null
    or v_target.account_type is null
    or v_viewer.account_type = v_target.account_type
    or v_viewer.suspended_at is not null
    or v_target.suspended_at is not null
    or v_viewer.deletion_requested_at is not null
    or v_target.deletion_requested_at is not null
    or v_target.public_slug is null
    or v_target.content_moderation_status is distinct from 'approved'
  then
    return;
  end if;

  if public.profile_pair_blocked(v_viewer_id, p_profile_id) then
    return;
  end if;

  insert into public.profile_views (
    viewer_id,
    profile_id,
    first_viewed_at,
    last_viewed_at,
    view_count
  )
  values (
    v_viewer_id,
    p_profile_id,
    now(),
    now(),
    1
  )
  on conflict (viewer_id, profile_id)
  do update set
    last_viewed_at = excluded.last_viewed_at,
    view_count = public.profile_views.view_count + 1;
end;
$$;

revoke all on function public.record_profile_view(uuid) from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated;

create or replace function public.get_profile_notification_summary()
returns table (
  profile_view_count bigint,
  profile_view_latest_at timestamptz,
  profile_favorite_count bigint,
  profile_favorite_latest_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  with current_profile as (
    select p.id, p.account_type
    from public.profiles p
    where p.id = (select auth.uid())
      and p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
  )
  select
    coalesce((
      select count(*)
      from public.profile_views pv
      join public.profiles actor
        on actor.id = pv.viewer_id
      where pv.profile_id = cp.id
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ), 0)::bigint as profile_view_count,
    (
      select max(pv.last_viewed_at)
      from public.profile_views pv
      join public.profiles actor
        on actor.id = pv.viewer_id
      where pv.profile_id = cp.id
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ) as profile_view_latest_at,
    coalesce((
      select count(*)
      from public.profile_favorites pf
      join public.profiles actor
        on actor.id = pf.user_id
      where pf.profile_id = cp.id
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ), 0)::bigint as profile_favorite_count,
    (
      select max(pf.created_at)
      from public.profile_favorites pf
      join public.profiles actor
        on actor.id = pf.user_id
      where pf.profile_id = cp.id
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ) as profile_favorite_latest_at
  from current_profile cp
  union all
  select 0::bigint, null::timestamptz, 0::bigint, null::timestamptz
  where not exists (select 1 from current_profile);
$$;

revoke all on function public.get_profile_notification_summary() from public, anon;
grant execute on function public.get_profile_notification_summary() to authenticated;

create or replace function public.get_profile_viewer_cards()
returns table (
  notification_at timestamptz,
  interaction_count integer,
  id uuid,
  public_slug text,
  account_type text,
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
stable
set search_path = public
as $$
  with current_profile as (
    select p.id, p.account_type
    from public.profiles p
    where p.id = (select auth.uid())
      and p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
  )
  select
    pv.last_viewed_at as notification_at,
    pv.view_count as interaction_count,
    actor.id,
    actor.public_slug,
    actor.account_type,
    actor.created_at,
    actor.full_name,
    actor.first_name,
    actor.country,
    actor.city,
    actor.nationality,
    actor.preferred_host_countries,
    actor.mother_tongue,
    actor.fluent_languages,
    actor.basic_languages,
    actor.availability_start,
    actor.availability_start_from,
    actor.availability_start_to,
    actor.duration,
    actor.duration_min_months,
    actor.duration_max_months,
    actor.smoking_status,
    actor.gender,
    actor.religion,
    actor.already_in_germany,
    case
      when coalesce(actor.birth_date, actor.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(actor.birth_date, actor.date_of_birth)))::integer
    end as age,
    actor.children_info,
    actor.au_pair_allowance_amount,
    actor.au_pair_allowance_currency,
    actor.accommodation_info,
    actor.expectations,
    actor.bio,
    actor.childcare_experience,
    actor.has_drivers_license,
    actor.has_childcare_experience,
    actor.has_infant_experience,
    actor.has_first_aid,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(actor.last_active_at) as activity_status,
    actor.verification_status
  from current_profile cp
  join public.profile_views pv
    on pv.profile_id = cp.id
  join public.profiles actor
    on actor.id = pv.viewer_id
  join public.profile_photos ph
    on ph.profile_id = actor.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = actor.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where actor.onboarding_completed = true
    and actor.account_type <> cp.account_type
    and actor.public_slug is not null
    and actor.suspended_at is null
    and actor.deletion_requested_at is null
    and actor.content_moderation_status = 'approved'
    and coalesce(actor.is_admin, false) = false
    and not public.profile_pair_blocked(cp.id, actor.id)
  group by
    pv.last_viewed_at,
    pv.view_count,
    actor.id,
    actor.public_slug,
    actor.account_type,
    actor.created_at,
    actor.full_name,
    actor.first_name,
    actor.country,
    actor.city,
    actor.nationality,
    actor.preferred_host_countries,
    actor.mother_tongue,
    actor.fluent_languages,
    actor.basic_languages,
    actor.availability_start,
    actor.availability_start_from,
    actor.availability_start_to,
    actor.duration,
    actor.duration_min_months,
    actor.duration_max_months,
    actor.smoking_status,
    actor.gender,
    actor.religion,
    actor.already_in_germany,
    actor.birth_date,
    actor.date_of_birth,
    actor.children_info,
    actor.au_pair_allowance_amount,
    actor.au_pair_allowance_currency,
    actor.accommodation_info,
    actor.expectations,
    actor.bio,
    actor.childcare_experience,
    actor.has_drivers_license,
    actor.has_childcare_experience,
    actor.has_infant_experience,
    actor.has_first_aid,
    actor.last_active_at,
    actor.verification_status,
    primary_photo.storage_path
  order by pv.last_viewed_at desc
  limit 100;
$$;

revoke all on function public.get_profile_viewer_cards() from public, anon;
grant execute on function public.get_profile_viewer_cards() to authenticated;

create or replace function public.get_profile_saver_cards()
returns table (
  notification_at timestamptz,
  interaction_count integer,
  id uuid,
  public_slug text,
  account_type text,
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
stable
set search_path = public
as $$
  with current_profile as (
    select p.id, p.account_type
    from public.profiles p
    where p.id = (select auth.uid())
      and p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
  )
  select
    pf.created_at as notification_at,
    1::integer as interaction_count,
    actor.id,
    actor.public_slug,
    actor.account_type,
    actor.created_at,
    actor.full_name,
    actor.first_name,
    actor.country,
    actor.city,
    actor.nationality,
    actor.preferred_host_countries,
    actor.mother_tongue,
    actor.fluent_languages,
    actor.basic_languages,
    actor.availability_start,
    actor.availability_start_from,
    actor.availability_start_to,
    actor.duration,
    actor.duration_min_months,
    actor.duration_max_months,
    actor.smoking_status,
    actor.gender,
    actor.religion,
    actor.already_in_germany,
    case
      when coalesce(actor.birth_date, actor.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(actor.birth_date, actor.date_of_birth)))::integer
    end as age,
    actor.children_info,
    actor.au_pair_allowance_amount,
    actor.au_pair_allowance_currency,
    actor.accommodation_info,
    actor.expectations,
    actor.bio,
    actor.childcare_experience,
    actor.has_drivers_license,
    actor.has_childcare_experience,
    actor.has_infant_experience,
    actor.has_first_aid,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(actor.last_active_at) as activity_status,
    actor.verification_status
  from current_profile cp
  join public.profile_favorites pf
    on pf.profile_id = cp.id
  join public.profiles actor
    on actor.id = pf.user_id
  join public.profile_photos ph
    on ph.profile_id = actor.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = actor.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where actor.onboarding_completed = true
    and actor.account_type <> cp.account_type
    and actor.public_slug is not null
    and actor.suspended_at is null
    and actor.deletion_requested_at is null
    and actor.content_moderation_status = 'approved'
    and coalesce(actor.is_admin, false) = false
    and not public.profile_pair_blocked(cp.id, actor.id)
  group by
    pf.created_at,
    actor.id,
    actor.public_slug,
    actor.account_type,
    actor.created_at,
    actor.full_name,
    actor.first_name,
    actor.country,
    actor.city,
    actor.nationality,
    actor.preferred_host_countries,
    actor.mother_tongue,
    actor.fluent_languages,
    actor.basic_languages,
    actor.availability_start,
    actor.availability_start_from,
    actor.availability_start_to,
    actor.duration,
    actor.duration_min_months,
    actor.duration_max_months,
    actor.smoking_status,
    actor.gender,
    actor.religion,
    actor.already_in_germany,
    actor.birth_date,
    actor.date_of_birth,
    actor.children_info,
    actor.au_pair_allowance_amount,
    actor.au_pair_allowance_currency,
    actor.accommodation_info,
    actor.expectations,
    actor.bio,
    actor.childcare_experience,
    actor.has_drivers_license,
    actor.has_childcare_experience,
    actor.has_infant_experience,
    actor.has_first_aid,
    actor.last_active_at,
    actor.verification_status,
    primary_photo.storage_path
  order by pf.created_at desc
  limit 100;
$$;

revoke all on function public.get_profile_saver_cards() from public, anon;
grant execute on function public.get_profile_saver_cards() to authenticated;
