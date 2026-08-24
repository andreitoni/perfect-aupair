-- Add a bounded language filter to the existing service-only public catalog.
-- The filter matches the mother tongue plus fluent and basic language lists.

do $$
declare
  v_function_definition text;
begin
  select pg_get_functiondef(
    'public.get_bounded_public_profile_cards(text,jsonb,uuid,text,integer,integer,integer,boolean)'::regprocedure
  ) into v_function_definition;

  v_function_definition := replace(
    v_function_definition,
    E'  v_country text;\n  v_start_from date;',
    E'  v_country text;\n  v_language text;\n  v_start_from date;'
  );

  v_function_definition := replace(
    v_function_definition,
    E'  v_country := nullif(left(btrim(coalesce(v_filters ->> ''country'', '''')), 100), '''');\n  v_activity :=',
    E'  v_country := nullif(left(btrim(coalesce(v_filters ->> ''country'', '''')), 100), '''');\n  v_language := nullif(left(btrim(coalesce(v_filters ->> ''language'', '''')), 100), '''');\n  v_activity :='
  );

  v_function_definition := replace(
    v_function_definition,
    E'        and (v_country is null or profile.country = v_country)\n        and (\n          (v_start_from is null and v_start_to is null)',
    E'        and (v_country is null or profile.country = v_country)\n        and (\n          p_account_type <> ''au_pair''\n          or v_language is null\n          or profile.mother_tongue = v_language\n          or v_language = any(coalesce(profile.fluent_languages, ''{}''::text[]))\n          or v_language = any(coalesce(profile.basic_languages, ''{}''::text[]))\n        )\n        and (\n          (v_start_from is null and v_start_to is null)'
  );

  if position('v_language text;' in v_function_definition) = 0
    or position('profile.mother_tongue = v_language' in v_function_definition) = 0
  then
    raise exception 'Could not add the public catalog language filter.';
  end if;

  execute v_function_definition;
end;
$$;

revoke all on function public.get_bounded_public_profile_cards(
  text,
  jsonb,
  uuid,
  text,
  integer,
  integer,
  integer,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.get_bounded_public_profile_cards(
  text,
  jsonb,
  uuid,
  text,
  integer,
  integer,
  integer,
  boolean
) to service_role;
