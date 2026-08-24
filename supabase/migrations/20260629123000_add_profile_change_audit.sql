create table if not exists public.profile_change_events (
  id uuid primary key default gen_random_uuid(),
  change_batch_id uuid not null default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  actor_kind text not null default 'system' check (
    actor_kind in ('user', 'service', 'system')
  ),
  category text not null check (
    category in (
      'identity_name',
      'phone',
      'location',
      'search',
      'text',
      'verification_sensitive'
    )
  ),
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  caused_verification_reset boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profile_change_events enable row level security;

create index if not exists profile_change_events_profile_created_idx
on public.profile_change_events (profile_id, created_at desc);

create index if not exists profile_change_events_category_created_idx
on public.profile_change_events (category, created_at desc);

create index if not exists profile_change_events_actor_created_idx
on public.profile_change_events (actor_id, created_at desc)
where actor_id is not null;

grant all on table public.profile_change_events to service_role;

revoke all on table public.profile_change_events from anon, authenticated;

create table if not exists public.profile_verification_photo_snapshots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  verification_request_id uuid references public.profile_verification_requests(id) on delete set null,
  profile_photo_id uuid not null,
  storage_path text not null,
  was_primary boolean not null default false,
  captured_at timestamptz not null default now()
);

alter table public.profile_verification_photo_snapshots enable row level security;

create index if not exists profile_verification_photo_snapshots_profile_idx
on public.profile_verification_photo_snapshots (profile_id, captured_at desc);

grant all on table public.profile_verification_photo_snapshots to service_role;

revoke all on table public.profile_verification_photo_snapshots from anon, authenticated;

create or replace function public.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_actor_kind text := case
    when current_setting('request.jwt.claim.role', true) = 'service_role' then 'service'
    when auth.uid() is not null then 'user'
    else 'system'
  end;
  v_batch_id uuid := gen_random_uuid();
  v_old_profile jsonb := to_jsonb(old);
  v_new_profile jsonb := to_jsonb(new);
  v_field_name text;
  v_category text;
  v_daily_limit integer;
  v_resets_verification boolean;
  v_old_value jsonb;
  v_new_value jsonb;
  v_checked_categories text[] := '{}'::text[];
  v_existing_changes integer;
  v_should_reset_verification boolean := false;
begin
  for v_field_name, v_category, v_daily_limit, v_resets_verification in
    select field_name, category, daily_limit, resets_verification
    from (
      values
        ('first_name', 'identity_name', 10, false),
        ('last_name', 'identity_name', 10, false),
        ('full_name', 'identity_name', 10, false),
        ('display_name', 'identity_name', 10, false),
        ('date_of_birth', 'verification_sensitive', 10, false),
        ('birth_date', 'verification_sensitive', 10, false),
        ('gender', 'verification_sensitive', 10, false),
        ('phone_country_code', 'phone', 5, false),
        ('phone_number', 'phone', 5, false),
        ('street_address', 'location', 5, false),
        ('postal_code', 'location', 5, false),
        ('city', 'location', 5, false),
        ('country', 'location', 5, false),
        ('nationality', 'search', 20, false),
        ('preferred_host_countries', 'search', 20, false),
        ('availability_start', 'search', 20, false),
        ('availability_start_from', 'search', 20, false),
        ('availability_start_to', 'search', 20, false),
        ('duration', 'search', 20, false),
        ('duration_min_months', 'search', 20, false),
        ('duration_max_months', 'search', 20, false),
        ('smoking_status', 'search', 20, false),
        ('religion', 'search', 20, false),
        ('already_in_germany', 'search', 20, false),
        ('has_drivers_license', 'search', 20, false),
        ('has_childcare_experience', 'search', 20, false),
        ('has_infant_experience', 'search', 20, false),
        ('has_first_aid', 'search', 20, false),
        ('height_cm', 'search', 20, false),
        ('weight_kg', 'search', 20, false),
        ('mother_tongue', 'search', 20, false),
        ('fluent_languages', 'search', 20, false),
        ('basic_languages', 'search', 20, false),
        ('languages', 'search', 20, false),
        ('children_info', 'search', 20, false),
        ('au_pair_allowance_amount', 'search', 20, false),
        ('au_pair_allowance_currency', 'search', 20, false),
        ('bio', 'text', 100, false),
        ('accommodation_info', 'text', 100, false),
        ('expectations', 'text', 100, false)
    ) as fields(field_name, category, daily_limit, resets_verification)
  loop
    v_old_value := v_old_profile -> v_field_name;
    v_new_value := v_new_profile -> v_field_name;

    if v_old_value is distinct from v_new_value then
      if
        v_actor_role <> 'service_role'
        and not (v_category = any(v_checked_categories))
      then
        select count(distinct change_batch_id)
        into v_existing_changes
        from public.profile_change_events
        where profile_id = old.id
          and category = v_category
          and created_at > now() - interval '1 day';

        if v_existing_changes >= v_daily_limit then
          raise exception 'Too many profile changes for % today. Please try again later.', v_category;
        end if;

        v_checked_categories := array_append(v_checked_categories, v_category);
      end if;

      if
        v_actor_role <> 'service_role'
        and v_resets_verification
        and old.verification_status = 'verified'
      then
        v_should_reset_verification := true;
      end if;

      insert into public.profile_change_events (
        change_batch_id,
        profile_id,
        actor_id,
        actor_role,
        actor_kind,
        category,
        field_name,
        old_value,
        new_value,
        caused_verification_reset
      )
      values (
        v_batch_id,
        old.id,
        v_actor_id,
        v_actor_role,
        v_actor_kind,
        v_category,
        v_field_name,
        v_old_value,
        v_new_value,
        v_actor_role <> 'service_role'
          and v_resets_verification
          and old.verification_status = 'verified'
      );
    end if;
  end loop;

  if v_should_reset_verification then
    new.verification_status := 'unverified';
    new.verification_requested_at := null;
    new.verification_reviewed_at := null;
    new.verification_rejected_reason := 'Profile identity details changed after verification.';
  end if;

  return new;
end;
$$;

drop trigger if exists audit_profile_changes_trigger on public.profiles;

create trigger audit_profile_changes_trigger
before update on public.profiles
for each row
execute function public.audit_profile_changes();

create or replace function public.audit_profile_photo_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_actor_kind text := case
    when current_setting('request.jwt.claim.role', true) = 'service_role' then 'service'
    when auth.uid() is not null then 'user'
    else 'system'
  end;
  v_old_value jsonb;
  v_new_value jsonb;
  v_was_verified boolean := false;
  v_field_name text := 'profile_photo_updated';
  v_latest_snapshot_at timestamptz;
  v_should_reset_photos boolean := false;
begin
  if tg_op = 'DELETE' then
    v_profile_id := old.profile_id;
    v_field_name := case
      when old.is_primary then 'primary_profile_photo_deleted'
      else 'profile_photo_deleted'
    end;
    v_old_value := jsonb_build_object(
      'photo_id', old.id,
      'storage_path', old.storage_path,
      'is_primary', old.is_primary,
      'sort_order', old.sort_order
    );
    v_new_value := null;
  elsif tg_op = 'INSERT' then
    v_profile_id := new.profile_id;
    v_field_name := case
      when new.is_primary then 'primary_profile_photo_added'
      else 'profile_photo_added'
    end;
    v_old_value := null;
    v_new_value := jsonb_build_object(
      'photo_id', new.id,
      'storage_path', new.storage_path,
      'is_primary', new.is_primary,
      'sort_order', new.sort_order
    );
  elsif tg_op = 'UPDATE' then
    if
      old.storage_path is not distinct from new.storage_path
      and old.is_primary is not distinct from new.is_primary
      and old.sort_order is not distinct from new.sort_order
    then
      return new;
    end if;

    v_profile_id := new.profile_id;
    v_field_name := case
      when old.is_primary is distinct from new.is_primary and new.is_primary
        then 'primary_profile_photo_added'
      when old.is_primary is distinct from new.is_primary and old.is_primary
        then 'primary_profile_photo_removed'
      else 'profile_photo_updated'
    end;
    v_old_value := jsonb_build_object(
      'photo_id', old.id,
      'storage_path', old.storage_path,
      'is_primary', old.is_primary,
      'sort_order', old.sort_order
    );
    v_new_value := jsonb_build_object(
      'photo_id', new.id,
      'storage_path', new.storage_path,
      'is_primary', new.is_primary,
      'sort_order', new.sort_order
    );
  end if;

  select verification_status = 'verified'
  into v_was_verified
  from public.profiles
  where id = v_profile_id;

  if v_actor_role <> 'service_role' and coalesce(v_was_verified, false) then
    select max(captured_at)
    into v_latest_snapshot_at
    from public.profile_verification_photo_snapshots
    where profile_id = v_profile_id;

    if v_latest_snapshot_at is not null then
      v_should_reset_photos := not exists (
        select 1
        from public.profile_verification_photo_snapshots snapshot
        join public.profile_photos photo
          on photo.id = snapshot.profile_photo_id
          and photo.profile_id = snapshot.profile_id
          and photo.storage_path = snapshot.storage_path
        where snapshot.profile_id = v_profile_id
          and snapshot.captured_at = v_latest_snapshot_at
      );
    end if;
  end if;

  insert into public.profile_change_events (
    profile_id,
    actor_id,
    actor_role,
    actor_kind,
    category,
    field_name,
    old_value,
    new_value,
    caused_verification_reset
  )
  values (
    v_profile_id,
    v_actor_id,
    v_actor_role,
    v_actor_kind,
    'verification_sensitive',
    v_field_name,
    v_old_value,
    v_new_value,
    v_should_reset_photos
  );

  if v_should_reset_photos then
    update public.profiles
    set
      verification_status = 'unverified',
      verification_requested_at = null,
      verification_reviewed_at = null,
      verification_rejected_reason = 'All profile photos from the verification review were removed or replaced.'
    where id = v_profile_id
      and verification_status = 'verified';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_primary_profile_photo_changes_trigger
on public.profile_photos;

drop trigger if exists audit_profile_photo_changes_trigger
on public.profile_photos;

create trigger audit_profile_photo_changes_trigger
after insert or update or delete on public.profile_photos
for each row
execute function public.audit_profile_photo_changes();

create or replace function public.capture_profile_verification_photo_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if new.verification_status <> 'verified' then
    return new;
  end if;

  if old.verification_status is not distinct from new.verification_status then
    return new;
  end if;

  select request.id
  into v_request_id
  from public.profile_verification_requests request
  where request.profile_id = new.id
    and request.status = 'verified'
  order by request.reviewed_at desc nulls last, request.created_at desc
  limit 1;

  insert into public.profile_verification_photo_snapshots (
    profile_id,
    verification_request_id,
    profile_photo_id,
    storage_path,
    was_primary
  )
  select
    photo.profile_id,
    v_request_id,
    photo.id,
    photo.storage_path,
    photo.is_primary
  from public.profile_photos photo
  where photo.profile_id = new.id;

  return new;
end;
$$;

drop trigger if exists capture_profile_verification_photo_snapshot_trigger
on public.profiles;

create trigger capture_profile_verification_photo_snapshot_trigger
after update of verification_status on public.profiles
for each row
execute function public.capture_profile_verification_photo_snapshot();

insert into public.profile_verification_photo_snapshots (
  profile_id,
  verification_request_id,
  profile_photo_id,
  storage_path,
  was_primary
)
select
  profile.id,
  request.id,
  photo.id,
  photo.storage_path,
  photo.is_primary
from public.profiles profile
join public.profile_photos photo
  on photo.profile_id = profile.id
left join lateral (
  select verification_request.id
  from public.profile_verification_requests verification_request
  where verification_request.profile_id = profile.id
    and verification_request.status = 'verified'
  order by verification_request.reviewed_at desc nulls last, verification_request.created_at desc
  limit 1
) request on true
where profile.verification_status = 'verified'
  and not exists (
    select 1
    from public.profile_verification_photo_snapshots snapshot
    where snapshot.profile_id = profile.id
  );
