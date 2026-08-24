-- Keep the database boundary aligned with the onboarding/edit-profile limits.
-- Server actions still provide friendly validation, while this trigger prevents
-- an authenticated client from bypassing them with direct PostgREST updates.

create or replace function public.enforce_authenticated_profile_input_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_birth_date date;
begin
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from (select auth.uid()) then
    raise exception 'Profiles can only be updated by their owner'
      using errcode = '42501';
  end if;

  if new.first_name is distinct from old.first_name
    and new.first_name is not null
    and (
      pg_catalog.char_length(pg_catalog.btrim(new.first_name)) not between 1 and 50
      or new.first_name ~ '[0-9]'
      or new.first_name ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid first name' using errcode = '22023';
  end if;

  if new.last_name is distinct from old.last_name
    and new.last_name is not null
    and (
      pg_catalog.char_length(pg_catalog.btrim(new.last_name)) not between 1 and 50
      or new.last_name ~ '[0-9]'
      or new.last_name ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid last name' using errcode = '22023';
  end if;

  if new.full_name is distinct from old.full_name
    and new.full_name is not null
    and (
      pg_catalog.char_length(pg_catalog.btrim(new.full_name)) not between 1 and 120
      or new.full_name ~ '[0-9]'
      or new.full_name ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid profile name' using errcode = '22023';
  end if;

  if new.display_name is distinct from old.display_name
    and new.display_name is not null
    and pg_catalog.char_length(new.display_name) > 120
  then
    raise exception 'Display name is too long' using errcode = '22023';
  end if;

  if new.city is distinct from old.city
    and new.city is not null
    and (
      pg_catalog.char_length(pg_catalog.btrim(new.city)) not between 1 and 100
      or new.city ~ '[0-9]'
      or new.city ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid city' using errcode = '22023';
  end if;

  if new.street_address is distinct from old.street_address
    and new.street_address is not null
    and pg_catalog.char_length(pg_catalog.btrim(new.street_address)) not between 2 and 100
  then
    raise exception 'Invalid street address' using errcode = '22023';
  end if;

  if new.phone_country_code is distinct from old.phone_country_code
    and new.phone_country_code is not null
    and new.phone_country_code !~ '^\+[0-9]{1,4}$'
  then
    raise exception 'Invalid phone country code' using errcode = '22023';
  end if;

  if new.phone_number is distinct from old.phone_number
    and new.phone_number is not null
    and new.phone_number !~ '^[0-9]{5,15}$'
  then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;

  if (
    (new.country is distinct from old.country and new.country is not null and pg_catalog.char_length(new.country) > 100)
    or (new.nationality is distinct from old.nationality and new.nationality is not null and pg_catalog.char_length(new.nationality) > 100)
    or (new.mother_tongue is distinct from old.mother_tongue and new.mother_tongue is not null and pg_catalog.char_length(new.mother_tongue) > 100)
    or (new.religion is distinct from old.religion and new.religion is not null and pg_catalog.char_length(new.religion) > 100)
    or (new.availability_start is distinct from old.availability_start and new.availability_start is not null and pg_catalog.char_length(new.availability_start) > 120)
    or (new.duration is distinct from old.duration and new.duration is not null and pg_catalog.char_length(new.duration) > 120)
  ) then
    raise exception 'Profile option is too long' using errcode = '22023';
  end if;

  if new.bio is distinct from old.bio
    and new.bio is not null
    and pg_catalog.char_length(new.bio) > 1400
  then
    raise exception 'Profile introduction is too long' using errcode = '22023';
  end if;

  if new.accommodation_info is distinct from old.accommodation_info
    and new.accommodation_info is not null
    and pg_catalog.char_length(new.accommodation_info) > 1200
  then
    raise exception 'Accommodation description is too long' using errcode = '22023';
  end if;

  if new.expectations is distinct from old.expectations
    and new.expectations is not null
    and pg_catalog.char_length(new.expectations) > 1400
  then
    raise exception 'Expectations are too long' using errcode = '22023';
  end if;

  if new.childcare_experience is distinct from old.childcare_experience
    and new.childcare_experience is not null
    and pg_catalog.char_length(new.childcare_experience) > 1400
  then
    raise exception 'Childcare experience is too long' using errcode = '22023';
  end if;

  if new.children_info is distinct from old.children_info
    and new.children_info is not null
    and pg_catalog.char_length(new.children_info) > 100
  then
    raise exception 'Children information is too long' using errcode = '22023';
  end if;

  if new.languages is distinct from old.languages
    and (
      pg_catalog.cardinality(new.languages) > 12
      or exists (
        select 1
        from pg_catalog.unnest(new.languages) as item(value)
        where pg_catalog.char_length(pg_catalog.btrim(item.value)) not between 1 and 100
      )
    )
  then
    raise exception 'Invalid language list' using errcode = '22023';
  end if;

  if new.fluent_languages is distinct from old.fluent_languages
    and (
      pg_catalog.cardinality(new.fluent_languages) > 12
      or exists (
        select 1
        from pg_catalog.unnest(new.fluent_languages) as item(value)
        where pg_catalog.char_length(pg_catalog.btrim(item.value)) not between 1 and 100
      )
    )
  then
    raise exception 'Invalid fluent-language list' using errcode = '22023';
  end if;

  if new.basic_languages is distinct from old.basic_languages
    and (
      pg_catalog.cardinality(new.basic_languages) > 12
      or exists (
        select 1
        from pg_catalog.unnest(new.basic_languages) as item(value)
        where pg_catalog.char_length(pg_catalog.btrim(item.value)) not between 1 and 100
      )
    )
  then
    raise exception 'Invalid basic-language list' using errcode = '22023';
  end if;

  if new.preferred_host_countries is distinct from old.preferred_host_countries
    and (
      pg_catalog.cardinality(new.preferred_host_countries) > 6
      or exists (
        select 1
        from pg_catalog.unnest(new.preferred_host_countries) as item(value)
        where pg_catalog.char_length(pg_catalog.btrim(item.value)) not between 1 and 100
      )
    )
  then
    raise exception 'Invalid preferred-country list' using errcode = '22023';
  end if;

  if new.date_of_birth is distinct from old.date_of_birth
    and new.birth_date is distinct from old.birth_date
    and new.date_of_birth is distinct from new.birth_date
  then
    raise exception 'Date of birth fields do not match' using errcode = '22023';
  elsif new.date_of_birth is distinct from old.date_of_birth then
    new.birth_date := new.date_of_birth;
  elsif new.birth_date is distinct from old.birth_date then
    new.date_of_birth := new.birth_date;
  end if;

  if new.date_of_birth is distinct from old.date_of_birth
    or new.birth_date is distinct from old.birth_date
  then
    v_birth_date := coalesce(new.birth_date, new.date_of_birth);

    if new.account_type = 'au_pair'
      and new.onboarding_completed
      and (
        v_birth_date is null
        or v_birth_date > (current_date - interval '18 years')::date
        or v_birth_date <= (current_date - interval '31 years')::date
      )
    then
      raise exception 'Au pairs must be between 18 and 30 years old'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_authenticated_profile_input_bounds()
from public, anon, authenticated, service_role;

drop trigger if exists ab_enforce_authenticated_profile_input_bounds_trigger
on public.profiles;

create trigger ab_enforce_authenticated_profile_input_bounds_trigger
before update on public.profiles
for each row
execute function public.enforce_authenticated_profile_input_bounds();
