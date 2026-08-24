create schema if not exists extensions;

create extension if not exists unaccent with schema extensions;

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
stable
set search_path = public, extensions
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

  v_base := lower(unaccent(v_raw));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '(^-+|-+$)', '', 'g');

  if length(v_base) < 3 then
    v_base := 'profile';
  end if;

  return left(v_base, 48);
end;
$$;

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
where p.onboarding_completed = true;
