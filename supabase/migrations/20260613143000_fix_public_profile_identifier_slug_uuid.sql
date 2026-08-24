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

grant execute on function public.get_public_profile_by_identifier(text) to anon, authenticated;
