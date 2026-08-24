-- Keep accidental Caps Lock names out of every write path, including direct
-- authenticated PostgREST writes. Intentional mixed casing (for example,
-- McDonald) is preserved.

create or replace function public.normalize_person_name_case(p_value text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_normalized text;
  v_lower_cased text;
  v_result text := '';
  v_character text;
  v_capitalize_next boolean := true;
  v_index integer;
begin
  if p_value is null then
    return null;
  end if;

  v_normalized := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_value),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_normalized = '' then
    return v_normalized;
  end if;

  if v_normalized = pg_catalog.lower(v_normalized)
    or v_normalized = pg_catalog.upper(v_normalized)
  then
    v_lower_cased := pg_catalog.lower(v_normalized);

    for v_index in 1..pg_catalog.char_length(v_lower_cased)
    loop
      v_character := pg_catalog.substr(v_lower_cased, v_index, 1);

      if v_capitalize_next and v_character ~ '[[:alpha:]]' then
        v_result := v_result || pg_catalog.upper(v_character);
        v_capitalize_next := false;
      else
        v_result := v_result || v_character;

        if v_character ~ '[[:alpha:]]' then
          v_capitalize_next := false;
        end if;
      end if;

      if v_character in (' ', '-', '''') then
        v_capitalize_next := true;
      end if;
    end loop;

    return v_result;
  end if;

  return v_normalized;
end;
$$;

revoke all on function public.normalize_person_name_case(text)
from public, anon, authenticated, service_role;

create or replace function public.normalize_profile_name_casing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.first_name := public.normalize_person_name_case(new.first_name);
  new.last_name := public.normalize_person_name_case(new.last_name);

  if new.account_type = 'family'
    and coalesce(pg_catalog.btrim(new.last_name), '') <> ''
    and pg_catalog.btrim(new.full_name) ~* '^the[[:space:]].+[[:space:]]family$'
    and (
      pg_catalog.btrim(new.full_name) = pg_catalog.lower(pg_catalog.btrim(new.full_name))
      or pg_catalog.btrim(new.full_name) = pg_catalog.upper(pg_catalog.btrim(new.full_name))
    )
  then
    new.full_name := 'The ' || new.last_name || ' family';
  else
    new.full_name := public.normalize_person_name_case(new.full_name);
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_profile_name_casing()
from public, anon, authenticated, service_role;

drop trigger if exists aaa_normalize_profile_name_casing_trigger
on public.profiles;

create trigger aaa_normalize_profile_name_casing_trigger
before insert or update of first_name, last_name, full_name
on public.profiles
for each row
execute function public.normalize_profile_name_casing();

-- Correct existing profiles without touching names that already use mixed
-- casing. The existing audit/moderation triggers retain the history of changes.
update public.profiles
set
  first_name = public.normalize_person_name_case(first_name),
  last_name = public.normalize_person_name_case(last_name),
  full_name = public.normalize_person_name_case(full_name)
where first_name is distinct from public.normalize_person_name_case(first_name)
  or last_name is distinct from public.normalize_person_name_case(last_name)
  or full_name is distinct from public.normalize_person_name_case(full_name);
