create or replace function public.get_public_profile(p_profile_id uuid)
returns table (
  id uuid,
  account_type text,
  full_name text,
  country text,
  city text,
  nationality text,
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  availability_start text,
  duration text,
  smoking_status text,
  bio text,
  children_info text,
  accommodation_info text,
  expectations text,
  primary_photo_path text,
  photo_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.duration,
    p.smoking_status,
    p.bio,
    p.children_info,
    p.accommodation_info,
    p.expectations,
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
    and (
      p.account_type = 'family'
      or exists (
        select 1
        from public.profile_photos required_photo
        where required_photo.profile_id = p.id
      )
    )
  group by
    p.id,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.duration,
    p.smoking_status,
    p.bio,
    p.children_info,
    p.accommodation_info,
    p.expectations,
    primary_photo.storage_path
  limit 1;
$$;

grant execute on function public.get_public_profile(uuid) to anon, authenticated;