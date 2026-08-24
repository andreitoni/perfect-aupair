-- Keep privileged profile corrections behind narrow service-role RPCs. The
-- browser never receives UPDATE access to another user's profile or photos.

alter table public.storage_upload_usage_events
  add column admin_profile_photo_expected_version text,
  add column admin_profile_photo_replacement_id uuid,
  add column admin_profile_photo_replacement_path text,
  add column admin_profile_photo_reserved_by uuid;

alter table public.storage_upload_usage_events
  add constraint storage_upload_admin_profile_photo_intent_check check (
    (
      admin_profile_photo_expected_version is null
      and admin_profile_photo_replacement_id is null
      and admin_profile_photo_replacement_path is null
      and admin_profile_photo_reserved_by is null
    )
    or (
      bucket_id = 'profile-photos'
      and admin_profile_photo_expected_version is not null
      and admin_profile_photo_expected_version ~ '^[0-9a-f]{64}$'
      and admin_profile_photo_reserved_by is not null
      and (
        (
          admin_profile_photo_replacement_id is null
          and admin_profile_photo_replacement_path is null
        )
        or (
          admin_profile_photo_replacement_id is not null
          and admin_profile_photo_replacement_path is not null
        )
      )
    )
  );

create or replace function public.admin_profile_photo_surface_version(
  p_profile_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_array(
              photo.id,
              photo.storage_path,
              photo.is_primary,
              photo.sort_order
            )
            order by photo.id
          )::text
          from public.profile_photos as photo
          where photo.profile_id = p_profile_id
        ), '[]'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

comment on function public.admin_profile_photo_surface_version(uuid) is
  'Service-role-only hash binding an admin upload reservation to the exact photo surface.';

revoke all on function public.admin_profile_photo_surface_version(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.admin_profile_photo_surface_version(uuid)
to service_role;

create or replace function public.lock_owner_profile_photo_statement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if coalesce((select auth.role()), '') = 'authenticated'
    and v_user_id is not null
  then
    -- Statement triggers run before the executor locks any photo tuple. This
    -- keeps owner inserts, updates and deletes on the same profile -> photos
    -- order as account deletion, moderation and admin repair RPCs.
    perform 1
    from public.profiles as profile
    where profile.id = v_user_id
    for update;
  end if;

  return null;
end;
$$;

revoke all on function public.lock_owner_profile_photo_statement()
from public, anon, authenticated, service_role;

drop trigger if exists a00_lock_owner_profile_photo_statement
on public.profile_photos;
create trigger a00_lock_owner_profile_photo_statement
before insert or update or delete on public.profile_photos
for each statement execute function public.lock_owner_profile_photo_statement();

create or replace function public.admin_profile_edit_version(
  p_profile_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Admin profile edit versions require the service role'
      using errcode = '42501';
  end if;

  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'full_name', profile.full_name,
          'first_name', profile.first_name,
          'last_name', profile.last_name,
          'date_of_birth', profile.date_of_birth,
          'birth_date', profile.birth_date,
          'gender', profile.gender,
          'phone_country_code', profile.phone_country_code,
          'phone_number', profile.phone_number,
          'street_address', profile.street_address,
          'city', profile.city,
          'country', profile.country,
          'nationality', profile.nationality,
          'preferred_host_countries', profile.preferred_host_countries,
          'religion', profile.religion,
          'smoking_status', profile.smoking_status,
          'already_in_germany', profile.already_in_germany,
          'has_drivers_license', profile.has_drivers_license,
          'has_childcare_experience', profile.has_childcare_experience,
          'has_infant_experience', profile.has_infant_experience,
          'has_first_aid', profile.has_first_aid,
          'will_care_for_elderly', profile.will_care_for_elderly,
          'will_care_for_pets', profile.will_care_for_pets,
          'mother_tongue', profile.mother_tongue,
          'fluent_languages', profile.fluent_languages,
          'basic_languages', profile.basic_languages,
          'languages', profile.languages,
          'bio', profile.bio,
          'childcare_experience', profile.childcare_experience,
          'children_info', profile.children_info,
          'au_pair_allowance_amount', profile.au_pair_allowance_amount,
          'au_pair_allowance_currency', profile.au_pair_allowance_currency,
          'accommodation_info', profile.accommodation_info,
          'expectations', profile.expectations
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  into v_version
  from public.profiles as profile
  where profile.id = p_profile_id;

  return v_version;
end;
$$;

comment on function public.admin_profile_edit_version(uuid) is
  'Service-role-only hash of the complete admin-editable profile surface.';

revoke all on function public.admin_profile_edit_version(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.admin_profile_edit_version(uuid)
to service_role;

create or replace function public.admin_profile_edit_snapshot(
  p_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_editable jsonb;
  v_account_type text;
  v_version text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Admin profile edit snapshots require the service role'
      using errcode = '42501';
  end if;

  select
    profile.account_type,
    pg_catalog.jsonb_build_object(
      'id', profile.id,
      'full_name', profile.full_name,
      'first_name', profile.first_name,
      'last_name', profile.last_name,
      'date_of_birth', profile.date_of_birth,
      'birth_date', profile.birth_date,
      'gender', profile.gender,
      'phone_country_code', profile.phone_country_code,
      'phone_number', profile.phone_number,
      'street_address', profile.street_address,
      'city', profile.city,
      'country', profile.country,
      'nationality', profile.nationality,
      'preferred_host_countries', profile.preferred_host_countries,
      'religion', profile.religion,
      'smoking_status', profile.smoking_status,
      'already_in_germany', profile.already_in_germany,
      'has_drivers_license', profile.has_drivers_license,
      'has_childcare_experience', profile.has_childcare_experience,
      'has_infant_experience', profile.has_infant_experience,
      'has_first_aid', profile.has_first_aid,
      'will_care_for_elderly', profile.will_care_for_elderly,
      'will_care_for_pets', profile.will_care_for_pets,
      'mother_tongue', profile.mother_tongue,
      'fluent_languages', profile.fluent_languages,
      'basic_languages', profile.basic_languages,
      'languages', profile.languages,
      'bio', profile.bio,
      'childcare_experience', profile.childcare_experience,
      'children_info', profile.children_info,
      'au_pair_allowance_amount', profile.au_pair_allowance_amount,
      'au_pair_allowance_currency', profile.au_pair_allowance_currency,
      'accommodation_info', profile.accommodation_info,
      'expectations', profile.expectations
    )
  into v_account_type, v_editable
  from public.profiles as profile
  where profile.id = p_profile_id;

  if not found then
    return null;
  end if;

  v_version := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to((v_editable - 'id')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return pg_catalog.jsonb_build_object(
    'profile', v_editable || pg_catalog.jsonb_build_object(
      'account_type', v_account_type
    ),
    'version', v_version
  );
end;
$$;

comment on function public.admin_profile_edit_snapshot(uuid) is
  'Service-role-only atomic editable-profile snapshot and matching revision hash.';

revoke all on function public.admin_profile_edit_snapshot(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.admin_profile_edit_snapshot(uuid)
to service_role;

create or replace function public.admin_profile_edit_version(
  p_profile_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Admin profile edit versions require the service role'
      using errcode = '42501';
  end if;

  v_snapshot := public.admin_profile_edit_snapshot(p_profile_id);

  return v_snapshot ->> 'version';
end;
$$;

create or replace function public.admin_update_profile_details(
  p_profile_id uuid,
  p_admin_profile_id uuid,
  p_expected_version text,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_fields constant text[] := array[
    'full_name',
    'first_name',
    'last_name',
    'date_of_birth',
    'gender',
    'phone_country_code',
    'phone_number',
    'street_address',
    'city',
    'country',
    'nationality',
    'preferred_host_countries',
    'religion',
    'smoking_status',
    'already_in_germany',
    'has_drivers_license',
    'has_childcare_experience',
    'has_infant_experience',
    'has_first_aid',
    'will_care_for_elderly',
    'will_care_for_pets',
    'mother_tongue',
    'fluent_languages',
    'basic_languages',
    'languages',
    'bio',
    'childcare_experience',
    'children_info',
    'au_pair_allowance_amount',
    'au_pair_allowance_currency',
    'accommodation_info',
    'expectations'
  ];
  v_nullable_text_fields constant text[] := array[
    'full_name',
    'first_name',
    'last_name',
    'gender',
    'phone_country_code',
    'phone_number',
    'street_address',
    'city',
    'country',
    'nationality',
    'religion',
    'smoking_status',
    'mother_tongue',
    'bio',
    'childcare_experience',
    'children_info',
    'accommodation_info',
    'expectations'
  ];
  v_boolean_fields constant text[] := array[
    'already_in_germany',
    'has_drivers_license',
    'has_childcare_experience',
    'has_infant_experience',
    'has_first_aid',
    'will_care_for_elderly',
    'will_care_for_pets'
  ];
  v_array_fields constant text[] := array[
    'preferred_host_countries',
    'fluent_languages',
    'basic_languages',
    'languages'
  ];
  v_language_options constant text[] := array[
    'Afrikaans', 'Albanian', 'Amharic', 'Arabic', 'Armenian', 'Assamese',
    'Azerbaijani', 'Basque', 'Belarusian', 'Bengali', 'Bosnian', 'Bulgarian',
    'Burmese', 'Catalan', 'Cebuano', 'Chinese', 'Croatian', 'Czech',
    'Danish', 'Dutch', 'English', 'Estonian', 'Farsi', 'Filipino', 'Finnish',
    'French', 'Georgian', 'German', 'Greek', 'Gujarati', 'Haitian Creole',
    'Hausa', 'Hebrew', 'Hindi', 'Hungarian', 'Icelandic', 'Igbo',
    'Indonesian', 'Irish', 'Italian', 'Japanese', 'Kannada', 'Kazakh', 'Khmer',
    'Kinyarwanda', 'Korean', 'Kurdish', 'Kyrgyz', 'Lao', 'Latvian',
    'Lithuanian', 'Macedonian', 'Malagasy', 'Malay', 'Malayalam', 'Marathi',
    'Mongolian', 'Nepali', 'Norwegian', 'Pashto', 'Polish', 'Portuguese',
    'Punjabi', 'Romanian', 'Russian', 'Serbian', 'Sinhala', 'Slovak',
    'Slovenian', 'Somali', 'Spanish', 'Swahili', 'Swedish', 'Tamil', 'Telugu',
    'Thai', 'Turkish', 'Ukrainian', 'Urdu', 'Uzbek', 'Vietnamese', 'Yoruba',
    'Zulu'
  ];
  v_current public.profiles%rowtype;
  v_next public.profiles%rowtype;
  v_updated public.profiles%rowtype;
  v_key text;
  v_date_text text;
  v_birth_date date;
  v_allowance_text text;
  v_current_version text;
  v_new_version text;
  v_changed_fields text[];
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Admin profile updates require the service role'
      using errcode = '42501';
  end if;

  if p_profile_id is null or p_admin_profile_id is null then
    raise exception 'Profile and admin identifiers are required'
      using errcode = '22023';
  end if;

  if p_expected_version is null
    or p_expected_version !~ '^[0-9a-f]{64}$'
  then
    raise exception 'A valid expected profile version is required'
      using errcode = '22023';
  end if;

  if p_updates is null or pg_catalog.jsonb_typeof(p_updates) <> 'object' then
    raise exception 'Profile updates must be a JSON object'
      using errcode = '22023';
  end if;

  if pg_catalog.pg_column_size(p_updates) > 65536 then
    raise exception 'Profile update payload is too large'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_updates) as requested(key)
    where not (requested.key = any (v_allowed_fields))
  ) then
    raise exception 'Profile update contains unsupported fields'
      using errcode = '22023';
  end if;

  perform 1
  from public.profiles as admin_profile
  where admin_profile.id = p_admin_profile_id
    and admin_profile.is_admin = true;

  if not found then
    raise exception 'Admin profile not found'
      using errcode = '42501';
  end if;

  select profile.*
  into v_current
  from public.profiles as profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Target profile not found'
      using errcode = 'P0002';
  end if;

  if v_current.is_admin then
    raise exception 'Admin profiles cannot be edited from moderation tools'
      using errcode = '42501';
  end if;

  v_current_version := public.admin_profile_edit_version(p_profile_id);

  if v_current_version is distinct from p_expected_version then
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'reason', 'stale',
      'profile_id', p_profile_id,
      'public_slug', v_current.public_slug,
      'current_version', v_current_version
    );
  end if;

  foreach v_key in array v_nullable_text_fields loop
    if p_updates ? v_key
      and coalesce(pg_catalog.jsonb_typeof(p_updates -> v_key), '')
        not in ('string', 'null')
    then
      raise exception 'Field % must be a string or null', v_key
        using errcode = '22023';
    end if;
  end loop;

  if p_updates ? 'au_pair_allowance_currency'
    and pg_catalog.jsonb_typeof(p_updates -> 'au_pair_allowance_currency')
      <> 'string'
  then
    raise exception 'Allowance currency must be a string'
      using errcode = '22023';
  end if;

  foreach v_key in array v_boolean_fields loop
    if p_updates ? v_key
      and pg_catalog.jsonb_typeof(p_updates -> v_key) <> 'boolean'
    then
      raise exception 'Field % must be a boolean', v_key
        using errcode = '22023';
    end if;
  end loop;

  foreach v_key in array v_array_fields loop
    if p_updates ? v_key
      and pg_catalog.jsonb_typeof(p_updates -> v_key) <> 'array'
    then
      raise exception 'Field % must be an array', v_key
        using errcode = '22023';
    end if;
  end loop;

  if p_updates ? 'date_of_birth'
    and coalesce(pg_catalog.jsonb_typeof(p_updates -> 'date_of_birth'), '')
      not in ('string', 'null')
  then
    raise exception 'Date of birth must be an ISO date or null'
      using errcode = '22023';
  end if;

  if p_updates ? 'au_pair_allowance_amount'
    and coalesce(
      pg_catalog.jsonb_typeof(p_updates -> 'au_pair_allowance_amount'),
      ''
    ) not in ('number', 'null')
  then
    raise exception 'Allowance amount must be an integer or null'
      using errcode = '22023';
  end if;

  foreach v_key in array v_array_fields loop
    if p_updates ? v_key then
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_updates -> v_key) as item(value)
        where pg_catalog.jsonb_typeof(item.value) <> 'string'
      ) then
        raise exception 'Field % must contain only strings', v_key
          using errcode = '22023';
      end if;

      if (
        v_key = 'preferred_host_countries'
        and pg_catalog.jsonb_array_length(p_updates -> v_key) > 6
      ) or (
        v_key <> 'preferred_host_countries'
        and pg_catalog.jsonb_array_length(p_updates -> v_key) > 12
      ) then
        raise exception 'Field % contains too many values', v_key
          using errcode = '22023';
      end if;

      if exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_updates -> v_key)
          as item(value)
        where pg_catalog.char_length(pg_catalog.btrim(item.value))
          not between 1 and 100
          or item.value ~ '[[:cntrl:]]'
      ) then
        raise exception 'Field % contains an invalid value', v_key
          using errcode = '22023';
      end if;

      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(p_updates -> v_key)
          as item(value)
      ) <> (
        select pg_catalog.count(distinct pg_catalog.lower(pg_catalog.btrim(item.value)))
        from pg_catalog.jsonb_array_elements_text(p_updates -> v_key)
          as item(value)
      ) then
        raise exception 'Field % contains duplicate values', v_key
          using errcode = '22023';
      end if;
    end if;
  end loop;

  foreach v_key in array array['fluent_languages', 'basic_languages', 'languages'] loop
    if p_updates ? v_key
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_updates -> v_key)
          as item(value)
        where not (pg_catalog.btrim(item.value) = any (v_language_options))
      )
    then
      raise exception 'Field % contains an unsupported language', v_key
        using errcode = '22023';
    end if;
  end loop;

  v_next := pg_catalog.jsonb_populate_record(
    v_current,
    (p_updates - 'date_of_birth') - 'au_pair_allowance_amount'
  );

  if p_updates ? 'date_of_birth' then
    if pg_catalog.jsonb_typeof(p_updates -> 'date_of_birth') = 'null' then
      v_birth_date := null;
    else
      v_date_text := p_updates ->> 'date_of_birth';

      if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Date of birth must use YYYY-MM-DD'
          using errcode = '22023';
      end if;

      begin
        v_birth_date := v_date_text::date;
      exception
        when others then
          raise exception 'Date of birth is not a valid calendar date'
            using errcode = '22023';
      end;
    end if;
  elsif v_current.date_of_birth is distinct from v_current.birth_date then
    v_birth_date := coalesce(v_current.birth_date, v_current.date_of_birth);
  else
    v_birth_date := v_current.date_of_birth;
  end if;

  v_next.date_of_birth := v_birth_date;
  v_next.birth_date := v_birth_date;

  if p_updates ? 'au_pair_allowance_amount' then
    if pg_catalog.jsonb_typeof(p_updates -> 'au_pair_allowance_amount') = 'null' then
      v_next.au_pair_allowance_amount := null;
    else
      v_allowance_text := p_updates ->> 'au_pair_allowance_amount';

      if v_allowance_text !~ '^[0-9]+$'
        or pg_catalog.char_length(v_allowance_text) > 5
      then
        raise exception 'Allowance amount must be a whole number'
          using errcode = '22023';
      end if;

      v_next.au_pair_allowance_amount := v_allowance_text::integer;
    end if;
  end if;

  if p_updates ? 'full_name' and v_next.full_name is not null then
    v_next.full_name := pg_catalog.btrim(v_next.full_name);
  end if;
  if p_updates ? 'first_name' and v_next.first_name is not null then
    v_next.first_name := pg_catalog.btrim(v_next.first_name);
  end if;
  if p_updates ? 'last_name' and v_next.last_name is not null then
    v_next.last_name := pg_catalog.btrim(v_next.last_name);
  end if;
  if p_updates ? 'gender' and v_next.gender is not null then
    v_next.gender := pg_catalog.btrim(v_next.gender);
  end if;
  if p_updates ? 'phone_country_code' and v_next.phone_country_code is not null then
    v_next.phone_country_code := pg_catalog.btrim(v_next.phone_country_code);
  end if;
  if p_updates ? 'phone_number' and v_next.phone_number is not null then
    v_next.phone_number := pg_catalog.btrim(v_next.phone_number);
  end if;
  if p_updates ? 'street_address' and v_next.street_address is not null then
    v_next.street_address := pg_catalog.btrim(v_next.street_address);
  end if;
  if p_updates ? 'city' and v_next.city is not null then
    v_next.city := pg_catalog.btrim(v_next.city);
  end if;
  if p_updates ? 'country' and v_next.country is not null then
    v_next.country := pg_catalog.btrim(v_next.country);
  end if;
  if p_updates ? 'nationality' and v_next.nationality is not null then
    v_next.nationality := pg_catalog.btrim(v_next.nationality);
  end if;
  if p_updates ? 'religion' and v_next.religion is not null then
    v_next.religion := pg_catalog.btrim(v_next.religion);
  end if;
  if p_updates ? 'smoking_status' and v_next.smoking_status is not null then
    v_next.smoking_status := pg_catalog.btrim(v_next.smoking_status);
  end if;
  if p_updates ? 'mother_tongue' and v_next.mother_tongue is not null then
    v_next.mother_tongue := pg_catalog.btrim(v_next.mother_tongue);
  end if;
  if p_updates ? 'bio' and v_next.bio is not null then
    v_next.bio := pg_catalog.btrim(v_next.bio);
  end if;
  if p_updates ? 'childcare_experience'
    and v_next.childcare_experience is not null
  then
    v_next.childcare_experience := pg_catalog.btrim(v_next.childcare_experience);
  end if;
  if p_updates ? 'children_info' and v_next.children_info is not null then
    v_next.children_info := pg_catalog.btrim(v_next.children_info);
  end if;
  if p_updates ? 'au_pair_allowance_currency' then
    v_next.au_pair_allowance_currency := pg_catalog.btrim(
      v_next.au_pair_allowance_currency
    );
  end if;
  if p_updates ? 'accommodation_info' and v_next.accommodation_info is not null then
    v_next.accommodation_info := pg_catalog.btrim(v_next.accommodation_info);
  end if;
  if p_updates ? 'expectations' and v_next.expectations is not null then
    v_next.expectations := pg_catalog.btrim(v_next.expectations);
  end if;

  if p_updates ? 'preferred_host_countries' then
    select coalesce(
      pg_catalog.array_agg(pg_catalog.btrim(item.value) order by item.ordinality),
      '{}'::text[]
    )
    into v_next.preferred_host_countries
    from pg_catalog.jsonb_array_elements_text(
      p_updates -> 'preferred_host_countries'
    ) with ordinality as item(value, ordinality);
  end if;

  if p_updates ? 'fluent_languages' then
    select coalesce(
      pg_catalog.array_agg(pg_catalog.btrim(item.value) order by item.ordinality),
      '{}'::text[]
    )
    into v_next.fluent_languages
    from pg_catalog.jsonb_array_elements_text(
      p_updates -> 'fluent_languages'
    ) with ordinality as item(value, ordinality);
  end if;

  if p_updates ? 'basic_languages' then
    select coalesce(
      pg_catalog.array_agg(pg_catalog.btrim(item.value) order by item.ordinality),
      '{}'::text[]
    )
    into v_next.basic_languages
    from pg_catalog.jsonb_array_elements_text(
      p_updates -> 'basic_languages'
    ) with ordinality as item(value, ordinality);
  end if;

  if p_updates ? 'languages' then
    select coalesce(
      pg_catalog.array_agg(pg_catalog.btrim(item.value) order by item.ordinality),
      '{}'::text[]
    )
    into v_next.languages
    from pg_catalog.jsonb_array_elements_text(
      p_updates -> 'languages'
    ) with ordinality as item(value, ordinality);
  end if;

  if p_updates ? 'full_name'
    and v_next.full_name is not null
    and (
      pg_catalog.char_length(v_next.full_name) not between 1 and 120
      or v_next.full_name ~ '[0-9]'
      or v_next.full_name ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid profile name' using errcode = '22023';
  end if;

  if p_updates ? 'first_name'
    and v_next.first_name is not null
    and (
      pg_catalog.char_length(v_next.first_name) not between 1 and 50
      or v_next.first_name ~ '[0-9]'
      or v_next.first_name ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid first name' using errcode = '22023';
  end if;

  if p_updates ? 'last_name'
    and v_next.last_name is not null
    and (
      pg_catalog.char_length(v_next.last_name) not between 1 and 50
      or v_next.last_name ~ '[0-9]'
      or v_next.last_name ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid last name' using errcode = '22023';
  end if;

  if p_updates ? 'city'
    and v_next.city is not null
    and (
      pg_catalog.char_length(v_next.city) not between 1 and 100
      or v_next.city ~ '[0-9]'
      or v_next.city ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid city' using errcode = '22023';
  end if;

  if p_updates ? 'street_address'
    and v_next.street_address is not null
    and (
      pg_catalog.char_length(v_next.street_address) not between 2 and 100
      or v_next.street_address ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid street address' using errcode = '22023';
  end if;

  if p_updates ? 'phone_country_code'
    and v_next.phone_country_code is not null
    and v_next.phone_country_code !~ '^\+[0-9]{1,4}$'
  then
    raise exception 'Invalid phone country code' using errcode = '22023';
  end if;

  if p_updates ? 'phone_number'
    and v_next.phone_number is not null
    and v_next.phone_number !~ '^[0-9]{5,15}$'
  then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;

  if (p_updates ? 'phone_country_code' or p_updates ? 'phone_number')
    and (
      (v_next.phone_country_code is null and v_next.phone_number is not null)
      or (v_next.phone_country_code is not null and v_next.phone_number is null)
    )
  then
    raise exception 'Phone country code and number must be set together'
      using errcode = '22023';
  end if;

  if p_updates ? 'country'
    and v_next.country is not null
    and (
      pg_catalog.char_length(v_next.country) not between 1 and 100
      or v_next.country ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid country' using errcode = '22023';
  end if;

  if p_updates ? 'nationality'
    and v_next.nationality is not null
    and (
      pg_catalog.char_length(v_next.nationality) not between 1 and 100
      or v_next.nationality ~ '[[:cntrl:]]'
    )
  then
    raise exception 'Invalid nationality' using errcode = '22023';
  end if;

  if p_updates ? 'gender'
    and v_next.gender is not null
    and not (v_next.gender = any (array['female', 'male']))
  then
    raise exception 'Unsupported gender value' using errcode = '22023';
  end if;

  if p_updates ? 'religion'
    and v_next.religion is not null
    and not (
      v_next.religion = any (
        array[
          'Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Judaism',
          'Sikhism', 'No religion', 'Other', 'Prefer not to say'
        ]
      )
    )
  then
    raise exception 'Unsupported religion value' using errcode = '22023';
  end if;

  if p_updates ? 'smoking_status'
    and v_next.smoking_status is not null
    and not (v_next.smoking_status = any (array['smoker', 'non_smoker']))
  then
    raise exception 'Unsupported smoking-status value' using errcode = '22023';
  end if;

  if p_updates ? 'mother_tongue'
    and v_next.mother_tongue is not null
    and not (v_next.mother_tongue = any (v_language_options))
  then
    raise exception 'Unsupported mother-tongue value' using errcode = '22023';
  end if;

  if p_updates ? 'children_info'
    and v_next.children_info is not null
    and not (
      v_next.children_info = any (array['1 child', '2 children', '3+ children'])
    )
  then
    raise exception 'Unsupported children-information value'
      using errcode = '22023';
  end if;

  if p_updates ? 'au_pair_allowance_currency'
    and not (
      v_next.au_pair_allowance_currency = any (array['EUR', 'GBP', 'USD'])
    )
  then
    raise exception 'Unsupported allowance currency' using errcode = '22023';
  end if;

  if p_updates ? 'au_pair_allowance_amount'
    and v_next.au_pair_allowance_amount is not null
    and v_next.au_pair_allowance_amount not between 1 and 20000
  then
    raise exception 'Allowance amount must be between 1 and 20000'
      using errcode = '22023';
  end if;

  if p_updates ? 'bio'
    and v_next.bio is not null
    and pg_catalog.char_length(v_next.bio) > 1400
  then
    raise exception 'Profile introduction is too long' using errcode = '22023';
  end if;

  if p_updates ? 'childcare_experience'
    and v_next.childcare_experience is not null
    and pg_catalog.char_length(v_next.childcare_experience) > 1400
  then
    raise exception 'Childcare experience is too long' using errcode = '22023';
  end if;

  if p_updates ? 'children_info'
    and v_next.children_info is not null
    and pg_catalog.char_length(v_next.children_info) > 100
  then
    raise exception 'Children information is too long' using errcode = '22023';
  end if;

  if p_updates ? 'accommodation_info'
    and v_next.accommodation_info is not null
    and pg_catalog.char_length(v_next.accommodation_info) > 1200
  then
    raise exception 'Accommodation description is too long'
      using errcode = '22023';
  end if;

  if p_updates ? 'expectations'
    and v_next.expectations is not null
    and pg_catalog.char_length(v_next.expectations) > 1400
  then
    raise exception 'Expectations are too long' using errcode = '22023';
  end if;

  if p_updates ? 'date_of_birth'
    or v_current.date_of_birth is distinct from v_current.birth_date
  then
    if v_birth_date is not null and v_birth_date > current_date then
      raise exception 'Date of birth cannot be in the future'
        using errcode = '22023';
    end if;

    if v_current.account_type = 'au_pair'
      and v_current.onboarding_completed
      and (p_updates ? 'date_of_birth')
      and v_birth_date is distinct from coalesce(
        v_current.birth_date,
        v_current.date_of_birth
      )
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

  if v_next.account_type = 'au_pair'
    and v_next.onboarding_completed
    and pg_catalog.cardinality(v_next.preferred_host_countries) = 0
  then
    raise exception 'Au pairs must select at least one preferred host country'
      using errcode = '22023';
  end if;

  if v_next.onboarding_completed
    and (
      coalesce(pg_catalog.btrim(v_next.full_name), '') = ''
      or coalesce(pg_catalog.btrim(v_next.country), '') = ''
      or coalesce(pg_catalog.btrim(v_next.city), '') = ''
    )
  then
    raise exception 'Completed profiles require a name, country and city'
      using errcode = '22023';
  end if;

  if v_next.account_type = 'au_pair'
    and v_next.onboarding_completed
    and (
      v_birth_date is null
      or v_next.gender is null
      or v_next.nationality is null
      or v_next.mother_tongue is null
    )
  then
    raise exception 'Completed au pair profiles are missing required fields'
      using errcode = '22023';
  end if;

  if v_next.account_type = 'family'
    and v_next.onboarding_completed
    and (
      v_next.children_info is null
      or v_next.au_pair_allowance_amount is null
    )
  then
    raise exception 'Completed family profiles are missing required fields'
      using errcode = '22023';
  end if;

  -- Match the existing name trigger before comparing versions, so equivalent
  -- casing changes remain idempotent and do not create an audit entry.
  v_next.first_name := public.normalize_person_name_case(v_next.first_name);
  v_next.last_name := public.normalize_person_name_case(v_next.last_name);

  if v_next.account_type = 'family'
    and coalesce(pg_catalog.btrim(v_next.last_name), '') <> ''
    and pg_catalog.btrim(v_next.full_name) ~* '^the[[:space:]].+[[:space:]]family$'
    and (
      pg_catalog.btrim(v_next.full_name) = pg_catalog.lower(pg_catalog.btrim(v_next.full_name))
      or pg_catalog.btrim(v_next.full_name) = pg_catalog.upper(pg_catalog.btrim(v_next.full_name))
    )
  then
    v_next.full_name := 'The ' || v_next.last_name || ' family';
  else
    v_next.full_name := public.normalize_person_name_case(v_next.full_name);
  end if;

  v_changed_fields := pg_catalog.array_remove(array[
    case when v_next.full_name is distinct from v_current.full_name then 'full_name' end,
    case when v_next.first_name is distinct from v_current.first_name then 'first_name' end,
    case when v_next.last_name is distinct from v_current.last_name then 'last_name' end,
    case when v_next.date_of_birth is distinct from v_current.date_of_birth
      or v_next.birth_date is distinct from v_current.birth_date
      then 'date_of_birth' end,
    case when v_next.gender is distinct from v_current.gender then 'gender' end,
    case when v_next.phone_country_code is distinct from v_current.phone_country_code
      then 'phone_country_code' end,
    case when v_next.phone_number is distinct from v_current.phone_number
      then 'phone_number' end,
    case when v_next.street_address is distinct from v_current.street_address
      then 'street_address' end,
    case when v_next.city is distinct from v_current.city then 'city' end,
    case when v_next.country is distinct from v_current.country then 'country' end,
    case when v_next.nationality is distinct from v_current.nationality
      then 'nationality' end,
    case when v_next.preferred_host_countries is distinct from v_current.preferred_host_countries
      then 'preferred_host_countries' end,
    case when v_next.religion is distinct from v_current.religion then 'religion' end,
    case when v_next.smoking_status is distinct from v_current.smoking_status
      then 'smoking_status' end,
    case when v_next.already_in_germany is distinct from v_current.already_in_germany
      then 'already_in_germany' end,
    case when v_next.has_drivers_license is distinct from v_current.has_drivers_license
      then 'has_drivers_license' end,
    case when v_next.has_childcare_experience is distinct from v_current.has_childcare_experience
      then 'has_childcare_experience' end,
    case when v_next.has_infant_experience is distinct from v_current.has_infant_experience
      then 'has_infant_experience' end,
    case when v_next.has_first_aid is distinct from v_current.has_first_aid
      then 'has_first_aid' end,
    case when v_next.will_care_for_elderly is distinct from v_current.will_care_for_elderly
      then 'will_care_for_elderly' end,
    case when v_next.will_care_for_pets is distinct from v_current.will_care_for_pets
      then 'will_care_for_pets' end,
    case when v_next.mother_tongue is distinct from v_current.mother_tongue
      then 'mother_tongue' end,
    case when v_next.fluent_languages is distinct from v_current.fluent_languages
      then 'fluent_languages' end,
    case when v_next.basic_languages is distinct from v_current.basic_languages
      then 'basic_languages' end,
    case when v_next.languages is distinct from v_current.languages then 'languages' end,
    case when v_next.bio is distinct from v_current.bio then 'bio' end,
    case when v_next.childcare_experience is distinct from v_current.childcare_experience
      then 'childcare_experience' end,
    case when v_next.children_info is distinct from v_current.children_info
      then 'children_info' end,
    case when v_next.au_pair_allowance_amount is distinct from v_current.au_pair_allowance_amount
      then 'au_pair_allowance_amount' end,
    case when v_next.au_pair_allowance_currency is distinct from v_current.au_pair_allowance_currency
      then 'au_pair_allowance_currency' end,
    case when v_next.accommodation_info is distinct from v_current.accommodation_info
      then 'accommodation_info' end,
    case when v_next.expectations is distinct from v_current.expectations
      then 'expectations' end
  ]::text[], null);

  if pg_catalog.cardinality(v_changed_fields) = 0 then
    return pg_catalog.jsonb_build_object(
      'applied', true,
      'reason', 'unchanged',
      'unchanged', true,
      'profile_id', p_profile_id,
      'public_slug', v_current.public_slug,
      'version', v_current_version,
      'changed_fields', pg_catalog.to_jsonb(v_changed_fields)
    );
  end if;

  update public.profiles
  set
    full_name = v_next.full_name,
    first_name = v_next.first_name,
    last_name = v_next.last_name,
    date_of_birth = v_next.date_of_birth,
    birth_date = v_next.birth_date,
    gender = v_next.gender,
    phone_country_code = v_next.phone_country_code,
    phone_number = v_next.phone_number,
    street_address = v_next.street_address,
    city = v_next.city,
    country = v_next.country,
    nationality = v_next.nationality,
    preferred_host_countries = v_next.preferred_host_countries,
    religion = v_next.religion,
    smoking_status = v_next.smoking_status,
    already_in_germany = v_next.already_in_germany,
    has_drivers_license = v_next.has_drivers_license,
    has_childcare_experience = v_next.has_childcare_experience,
    has_infant_experience = v_next.has_infant_experience,
    has_first_aid = v_next.has_first_aid,
    will_care_for_elderly = v_next.will_care_for_elderly,
    will_care_for_pets = v_next.will_care_for_pets,
    mother_tongue = v_next.mother_tongue,
    fluent_languages = v_next.fluent_languages,
    basic_languages = v_next.basic_languages,
    languages = v_next.languages,
    bio = v_next.bio,
    childcare_experience = v_next.childcare_experience,
    children_info = v_next.children_info,
    au_pair_allowance_amount = v_next.au_pair_allowance_amount,
    au_pair_allowance_currency = v_next.au_pair_allowance_currency,
    accommodation_info = v_next.accommodation_info,
    expectations = v_next.expectations
  where id = p_profile_id
  returning * into v_updated;

  v_new_version := public.admin_profile_edit_version(p_profile_id);

  insert into public.admin_audit_log (
    admin_profile_id,
    action,
    target_profile_id,
    target_resource_type,
    target_resource_id,
    metadata
  )
  values (
    p_admin_profile_id,
    'admin_update_profile_details',
    p_profile_id,
    'profile',
    p_profile_id::text,
    pg_catalog.jsonb_build_object(
      'changedFields', pg_catalog.to_jsonb(v_changed_fields),
      'versions', pg_catalog.jsonb_build_object(
        'before', v_current_version,
        'after', v_new_version
      )
    )
  );

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'reason', 'updated',
    'unchanged', false,
    'profile_id', p_profile_id,
    'public_slug', v_updated.public_slug,
    'previous_version', v_current_version,
    'version', v_new_version,
    'changed_fields', pg_catalog.to_jsonb(v_changed_fields)
  );
end;
$$;

comment on function public.admin_update_profile_details(uuid, uuid, text, jsonb) is
  'Service-role-only, revision-locked update of the allowlisted profile fields.';

revoke all on function public.admin_update_profile_details(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.admin_update_profile_details(uuid, uuid, text, jsonb)
to service_role;

create or replace function public.admin_set_primary_profile_photo(
  p_photo_id uuid,
  p_admin_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_public_slug text;
  v_is_admin boolean;
  v_is_primary boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Admin photo updates require the service role'
      using errcode = '42501';
  end if;

  if p_photo_id is null or p_admin_profile_id is null then
    raise exception 'Photo and admin identifiers are required'
      using errcode = '22023';
  end if;

  perform 1
  from public.profiles as admin_profile
  where admin_profile.id = p_admin_profile_id
    and admin_profile.is_admin = true;

  if not found then
    raise exception 'Admin profile not found'
      using errcode = '42501';
  end if;

  select photo.profile_id
  into v_profile_id
  from public.profile_photos as photo
  where photo.id = p_photo_id;

  if not found then
    raise exception 'Profile photo not found'
      using errcode = 'P0002';
  end if;

  select profile.public_slug, profile.is_admin
  into v_public_slug, v_is_admin
  from public.profiles as profile
  where profile.id = v_profile_id
  for update;

  if not found then
    raise exception 'Target profile not found'
      using errcode = 'P0002';
  end if;

  if v_is_admin then
    raise exception 'Admin profiles cannot be edited from moderation tools'
      using errcode = '42501';
  end if;

  perform 1
  from public.profile_photos as photo
  where photo.profile_id = v_profile_id
  order by photo.id
  for update;

  select photo.is_primary
  into v_is_primary
  from public.profile_photos as photo
  where photo.id = p_photo_id
    and photo.profile_id = v_profile_id
  for update;

  if not found then
    raise exception 'Profile photo no longer exists'
      using errcode = 'P0002';
  end if;

  if v_is_primary then
    return pg_catalog.jsonb_build_object(
      'applied', true,
      'reason', 'unchanged',
      'unchanged', true,
      'profile_id', v_profile_id,
      'public_slug', v_public_slug,
      'photo_id', p_photo_id
    );
  end if;

  update public.profile_photos
  set is_primary = true
  where id = p_photo_id
    and profile_id = v_profile_id;

  insert into public.admin_audit_log (
    admin_profile_id,
    action,
    target_profile_id,
    target_resource_type,
    target_resource_id,
    metadata
  )
  values (
    p_admin_profile_id,
    'admin_set_primary_profile_photo',
    v_profile_id,
    'profile_photo',
    p_photo_id::text,
    pg_catalog.jsonb_build_object(
      'changedFields', pg_catalog.jsonb_build_array('primary_profile_photo')
    )
  );

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'reason', 'updated',
    'unchanged', false,
    'profile_id', v_profile_id,
    'public_slug', v_public_slug,
    'photo_id', p_photo_id
  );
end;
$$;

comment on function public.admin_set_primary_profile_photo(uuid, uuid) is
  'Service-role-only, serialized and idempotent primary profile-photo update.';

revoke all on function public.admin_set_primary_profile_photo(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.admin_set_primary_profile_photo(uuid, uuid)
to service_role;

-- Keep the owner path on the same deterministic photo lock order used by the
-- admin path. Owner-side deletes already lock a photo tuple before their
-- profile-row trigger, so no admin transaction may hold the profile first.
create or replace function public.set_primary_profile_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile_id uuid;
begin
  if v_user_id is null or p_photo_id is null then
    raise exception 'Photo not found'
      using errcode = 'P0002';
  end if;

  select photo.profile_id
  into v_profile_id
  from public.profile_photos as photo
  where photo.id = p_photo_id
    and photo.profile_id = v_user_id;

  if not found then
    raise exception 'Photo not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = v_profile_id
  for update;

  if not found then
    raise exception 'Profile not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.profile_photos as photo
  where photo.profile_id = v_profile_id
  order by photo.id
  for update;

  perform 1
  from public.profile_photos as photo
  where photo.id = p_photo_id
    and photo.profile_id = v_profile_id;

  if not found then
    raise exception 'Photo no longer exists'
      using errcode = 'P0002';
  end if;

  update public.profile_photos
  set is_primary = (id = p_photo_id)
  where profile_id = v_profile_id
    and is_primary is distinct from (id = p_photo_id);
end;
$$;

revoke all on function public.set_primary_profile_photo(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.set_primary_profile_photo(uuid)
to authenticated;

create or replace function public.delete_profile_photo_for_moderation(
  p_photo_id uuid,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_storage_path text;
  v_was_primary boolean;
  v_remaining_photos integer;
  v_next_photo_id uuid;
  v_public_slug text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_photo_id is null
    or p_reviewer_id is null
    or not exists (
      select 1
      from public.profiles as reviewer
      where reviewer.id = p_reviewer_id
        and coalesce(reviewer.is_admin, false) = true
    )
  then
    raise exception 'A valid administrator is required'
      using errcode = '42501';
  end if;

  select photo.profile_id
  into v_profile_id
  from public.profile_photos as photo
  where photo.id = p_photo_id;

  if v_profile_id is null then
    return null;
  end if;

  select profile.public_slug
  into v_public_slug
  from public.profiles as profile
  where profile.id = v_profile_id
    and coalesce(profile.is_admin, false) = false
  for update;

  if not found then
    raise exception 'Admin profiles cannot be moderated from this dashboard'
      using errcode = '42501';
  end if;

  select photo.storage_path, photo.is_primary
  into v_storage_path, v_was_primary
  from public.profile_photos as photo
  where photo.id = p_photo_id
    and photo.profile_id = v_profile_id
  for update;

  if not found then
    return null;
  end if;

  delete from public.profile_photos
  where id = p_photo_id;

  select pg_catalog.count(*)::integer
  into v_remaining_photos
  from public.profile_photos as photo
  where photo.profile_id = v_profile_id;

  if v_remaining_photos = 0 then
    update public.profiles
    set
      content_moderation_needs_review = true,
      content_moderation_reviewed_at = null,
      content_moderation_reviewed_by = null,
      content_moderation_reason =
        'The last profile photo was removed during moderation. A new photo is required.'
    where id = v_profile_id;
  elsif v_was_primary then
    select photo.id
    into v_next_photo_id
    from public.profile_photos as photo
    where photo.profile_id = v_profile_id
    order by photo.sort_order, photo.created_at, photo.id
    limit 1;

    update public.profile_photos
    set is_primary = true
    where id = v_next_photo_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'profile_id', v_profile_id,
    'storage_path', v_storage_path,
    'was_primary', v_was_primary,
    'remaining_photos', v_remaining_photos,
    'public_slug', v_public_slug
  );
end;
$$;

revoke all on function public.delete_profile_photo_for_moderation(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.delete_profile_photo_for_moderation(uuid, uuid)
to service_role;

create or replace function public.admin_reserve_profile_photo_upload(
  p_profile_id uuid,
  p_admin_profile_id uuid,
  p_object_name text,
  p_size_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing_size bigint;
  v_window_count integer;
  v_window_bytes bigint;
  v_daily_count integer;
  v_daily_bytes bigint;
  v_live_count integer;
  v_live_bytes bigint;
  v_global_live_bytes bigint;
  v_photo_count integer;
  v_photo_surface_version text;
  v_replaced_photo_id uuid;
  v_replaced_storage_path text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Admin photo uploads require the service role'
      using errcode = '42501';
  end if;

  if p_profile_id is null or p_admin_profile_id is null then
    raise exception 'Profile and admin identifiers are required'
      using errcode = '22023';
  end if;

  if p_object_name is null
    or p_object_name !~ (
      '^' || p_profile_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    )
    or p_size_bytes is null
    or p_size_bytes not between 1 and 786432
  then
    raise exception 'Invalid admin profile-photo upload'
      using errcode = '22023';
  end if;

  perform 1
  from public.profiles as admin_profile
  where admin_profile.id = p_admin_profile_id
    and admin_profile.is_admin = true;

  if not found then
    raise exception 'Admin profile not found'
      using errcode = '42501';
  end if;

  if not coalesce((
    select flag.enabled
    from public.feature_flags as flag
    where flag.key = 'uploads'
  ), false) then
    return false;
  end if;

  -- Match the normal reservation protocol before taking the profile-row lock;
  -- the ledger FK later acquires a profile KEY SHARE lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:storage-upload-global:profile-photos',
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'perfect-aupair:storage-upload:' || p_profile_id::text || ':profile-photos',
      0
    )
  );

  perform 1
  from public.profiles as target_profile
  where target_profile.id = p_profile_id
    and coalesce(target_profile.is_admin, false) = false
    and target_profile.deletion_requested_at is null
    and target_profile.deletion_scheduled_at is null
  for update;

  if not found then
    raise exception 'Target profile not found or protected'
      using errcode = '42501';
  end if;

  perform 1
  from public.profile_photos as photo
  where photo.profile_id = p_profile_id
  order by photo.id
  for update;

  select pg_catalog.count(*)::integer
  into v_photo_count
  from public.profile_photos as photo
  where photo.profile_id = p_profile_id;

  v_photo_surface_version :=
    public.admin_profile_photo_surface_version(p_profile_id);

  if v_photo_count > 5 then
    return false;
  end if;

  if v_photo_count = 5 then
    select photo.id, photo.storage_path
    into v_replaced_photo_id, v_replaced_storage_path
    from public.profile_photos as photo
    where photo.profile_id = p_profile_id
    order by photo.is_primary desc, photo.sort_order, photo.id
    limit 1;
  end if;

  -- Admins may repair an incomplete or suspended member profile. Keep the
  -- same per-member and global Storage ceilings without inheriting the normal
  -- end-user eligibility check from reserve_storage_upload_quota().
  delete from public.storage_upload_usage_events as event
  where event.bucket_id = 'profile-photos'
    and event.committed_at is null
    and event.created_at < v_now - interval '1 hour';

  if exists (
    select 1
    from public.storage_upload_usage_events as event
    where event.bucket_id = 'profile-photos'
      and event.object_name = p_object_name
      and event.uploader_id <> p_profile_id
  ) then
    return false;
  end if;

  select event.size_bytes
  into v_existing_size
  from public.storage_upload_usage_events as event
  where event.uploader_id = p_profile_id
    and event.bucket_id = 'profile-photos'
    and event.object_name = p_object_name
    and event.deleted_at is null
  limit 1;

  if exists (
    select 1
    from public.storage_upload_usage_events as event
    where event.uploader_id = p_profile_id
      and event.bucket_id = 'profile-photos'
      and event.object_name = p_object_name
      and event.deleted_at is not null
  ) then
    return false;
  end if;

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_window_count, v_window_bytes
  from public.storage_upload_usage_events as event
  where event.uploader_id = p_profile_id
    and event.bucket_id = 'profile-photos'
    and event.object_name <> p_object_name
    and event.created_at > v_now - interval '10 minutes';

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_daily_count, v_daily_bytes
  from public.storage_upload_usage_events as event
  where event.uploader_id = p_profile_id
    and event.bucket_id = 'profile-photos'
    and event.object_name <> p_object_name
    and event.created_at > v_now - interval '24 hours';

  select
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_live_count, v_live_bytes
  from public.storage_upload_usage_events as event
  where event.uploader_id = p_profile_id
    and event.bucket_id = 'profile-photos'
    and event.object_name <> p_object_name
    and (
      v_replaced_storage_path is null
      or event.object_name <> v_replaced_storage_path
    )
    and event.deleted_at is null
    and (
      event.committed_at is not null
      or event.created_at > v_now - interval '1 hour'
    );

  select coalesce(pg_catalog.sum(event.size_bytes), 0)::bigint
  into v_global_live_bytes
  from public.storage_upload_usage_events as event
  where event.bucket_id = 'profile-photos'
    and event.object_name <> p_object_name
    and (
      v_replaced_storage_path is null
      or event.object_name <> v_replaced_storage_path
    )
    and event.deleted_at is null
    and (
      event.committed_at is not null
      or event.created_at > v_now - interval '1 hour'
    );

  p_size_bytes := greatest(
    p_size_bytes,
    coalesce(v_existing_size, 0)
  );

  if v_window_count + 1 > 20
    or v_window_bytes + p_size_bytes > 50::bigint * 1024 * 1024
    or v_daily_count + 1 > 100
    or v_daily_bytes + p_size_bytes > 100::bigint * 1024 * 1024
    or v_live_count + 1 > 5
    or v_live_bytes + p_size_bytes > 25::bigint * 1024 * 1024
    or v_global_live_bytes + p_size_bytes > 5::bigint * 1024 * 1024 * 1024
  then
    return false;
  end if;

  insert into public.storage_upload_usage_events (
    uploader_id,
    bucket_id,
    object_name,
    size_bytes,
    admin_profile_photo_expected_version,
    admin_profile_photo_replacement_id,
    admin_profile_photo_replacement_path,
    admin_profile_photo_reserved_by
  )
  values (
    p_profile_id,
    'profile-photos',
    p_object_name,
    p_size_bytes,
    v_photo_surface_version,
    v_replaced_photo_id,
    v_replaced_storage_path,
    p_admin_profile_id
  )
  on conflict (bucket_id, object_name) do update
  set
    size_bytes = greatest(
      public.storage_upload_usage_events.size_bytes,
      excluded.size_bytes
    ),
    admin_profile_photo_expected_version =
      excluded.admin_profile_photo_expected_version,
    admin_profile_photo_replacement_id =
      excluded.admin_profile_photo_replacement_id,
    admin_profile_photo_replacement_path =
      excluded.admin_profile_photo_replacement_path,
    admin_profile_photo_reserved_by =
      excluded.admin_profile_photo_reserved_by
  where public.storage_upload_usage_events.uploader_id = excluded.uploader_id
    and public.storage_upload_usage_events.deleted_at is null;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.admin_reserve_profile_photo_upload(
  uuid,
  uuid,
  text,
  bigint
) is
  'Service-role-only reservation that charges an admin repair upload to the target profile quota and ledger, including for incomplete or suspended members.';

revoke all on function public.admin_reserve_profile_photo_upload(
  uuid,
  uuid,
  text,
  bigint
)
from public, anon, authenticated, service_role;

grant execute on function public.admin_reserve_profile_photo_upload(
  uuid,
  uuid,
  text,
  bigint
)
to service_role;

create or replace function public.admin_attach_profile_photo(
  p_profile_id uuid,
  p_admin_profile_id uuid,
  p_object_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo_id uuid;
  v_public_slug text;
  v_sort_order integer;
  v_is_admin boolean;
  v_deletion_requested_at timestamptz;
  v_deletion_scheduled_at timestamptz;
  v_existing_photo_id uuid;
  v_photo_count integer;
  v_expected_photo_surface_version text;
  v_current_photo_surface_version text;
  v_reserved_by uuid;
  v_replaced_photo_id uuid;
  v_replaced_storage_path text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Admin photo uploads require the service role'
      using errcode = '42501';
  end if;

  if p_profile_id is null
    or p_admin_profile_id is null
    or p_object_name is null
    or p_object_name !~ (
      '^' || p_profile_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](jpg|png|webp)$'
    )
  then
    raise exception 'Invalid admin profile-photo attachment'
      using errcode = '22023';
  end if;

  perform 1
  from public.profiles as admin_profile
  where admin_profile.id = p_admin_profile_id
    and admin_profile.is_admin = true;

  if not found then
    raise exception 'Admin profile not found'
      using errcode = '42501';
  end if;

  select
    target_profile.public_slug,
    target_profile.is_admin,
    target_profile.deletion_requested_at,
    target_profile.deletion_scheduled_at
  into
    v_public_slug,
    v_is_admin,
    v_deletion_requested_at,
    v_deletion_scheduled_at
  from public.profiles as target_profile
  where target_profile.id = p_profile_id
  for update;

  if not found or coalesce(v_is_admin, false) then
    raise exception 'Target profile not found or protected'
      using errcode = '42501';
  end if;

  perform 1
  from public.profile_photos as photo
  where photo.profile_id = p_profile_id
  order by photo.id
  for update;

  v_current_photo_surface_version :=
    public.admin_profile_photo_surface_version(p_profile_id);

  select photo.id
  into v_existing_photo_id
  from public.profile_photos as photo
  where photo.profile_id = p_profile_id
    and photo.storage_path = p_object_name;

  -- A retry after an ambiguous network response must never create a duplicate
  -- audit entry or remove the object that a committed row already references.
  if v_existing_photo_id is not null then
    return pg_catalog.jsonb_build_object(
      'applied', true,
      'unchanged', true,
      'profile_id', p_profile_id,
      'public_slug', v_public_slug,
      'photo_id', v_existing_photo_id,
      'storage_path', p_object_name
    );
  end if;

  if v_deletion_requested_at is not null
    or v_deletion_scheduled_at is not null
  then
    raise exception 'Target profile is pending deletion'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-object:profile-photos:' || p_object_name,
      0
    )
  );

  select
    event.admin_profile_photo_expected_version,
    event.admin_profile_photo_replacement_id,
    event.admin_profile_photo_replacement_path,
    event.admin_profile_photo_reserved_by
  into
    v_expected_photo_surface_version,
    v_replaced_photo_id,
    v_replaced_storage_path,
    v_reserved_by
  from public.storage_upload_usage_events as event
  where event.uploader_id = p_profile_id
    and event.bucket_id = 'profile-photos'
    and event.object_name = p_object_name
    and event.size_bytes between 1 and 786432
    and event.committed_at is not null
    and event.deleted_at is null
    and event.deletion_claim_token is null
  for update;

  if not found then
    raise exception 'The uploaded profile photo is not committed'
      using errcode = '42501';
  end if;

  if v_reserved_by is distinct from p_admin_profile_id
    or v_expected_photo_surface_version is null
  then
    raise exception 'The upload is not bound to this admin review'
      using errcode = '42501';
  end if;

  if v_expected_photo_surface_version is distinct from
    v_current_photo_surface_version
  then
    raise exception 'The profile photos changed. Refresh and upload again.'
      using errcode = '40001';
  end if;

  select pg_catalog.count(*)::integer
  into v_photo_count
  from public.profile_photos as photo
  where photo.profile_id = p_profile_id;

  if v_photo_count > 5 then
    raise exception 'The profile has an invalid photo count'
      using errcode = '23514';
  end if;

  if v_replaced_photo_id is not null then
    if v_photo_count <> 5 or v_replaced_storage_path is null then
      raise exception 'The profile photos changed. Refresh and upload again.'
        using errcode = '40001';
    end if;

    select photo.sort_order
    into v_sort_order
    from public.profile_photos as photo
    where photo.profile_id = p_profile_id
      and photo.id = v_replaced_photo_id
      and photo.storage_path = v_replaced_storage_path;

    if not found then
      raise exception 'The profile photos changed. Refresh and upload again.'
        using errcode = '40001';
    end if;

    delete from public.profile_photos
    where id = v_replaced_photo_id
      and profile_id = p_profile_id;
  elsif v_photo_count < 5 then
    select coalesce(pg_catalog.max(photo.sort_order), -1) + 1
    into v_sort_order
    from public.profile_photos as photo
    where photo.profile_id = p_profile_id;
  else
    raise exception 'The profile photos changed. Refresh and upload again.'
      using errcode = '40001';
  end if;

  insert into public.profile_photos (
    profile_id,
    storage_path,
    is_primary,
    sort_order
  )
  values (
    p_profile_id,
    p_object_name,
    true,
    v_sort_order
  )
  returning id into v_photo_id;

  insert into public.admin_audit_log (
    admin_profile_id,
    action,
    target_profile_id,
    target_resource_type,
    target_resource_id,
    metadata
  )
  values (
    p_admin_profile_id,
    'admin_upload_profile_photo',
    p_profile_id,
    'profile_photo',
    v_photo_id::text,
    pg_catalog.jsonb_build_object(
      'changedFields',
      pg_catalog.jsonb_build_array(
        'profile_photos',
        'primary_profile_photo'
      ),
      'replacedPhotoId',
      v_replaced_photo_id,
      'replacedStoragePath',
      v_replaced_storage_path
    )
  );

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'profile_id', p_profile_id,
    'public_slug', v_public_slug,
    'photo_id', v_photo_id,
    'storage_path', p_object_name,
    'replaced_photo_id', v_replaced_photo_id,
    'replaced_storage_path', v_replaced_storage_path
  );
end;
$$;

comment on function public.admin_attach_profile_photo(uuid, uuid, text) is
  'Service-role-only attachment of a committed, quota-reserved photo with atomic admin audit logging.';

revoke all on function public.admin_attach_profile_photo(uuid, uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.admin_attach_profile_photo(uuid, uuid, text)
to service_role;
