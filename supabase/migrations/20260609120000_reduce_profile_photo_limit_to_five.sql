create or replace function public.enforce_profile_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.profile_photos pp
    where pp.profile_id = new.profile_id
      and pp.id <> coalesce(new.id, gen_random_uuid())
  ) >= 5 then
    raise exception 'You can upload a maximum of 5 photos.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_profile_photo_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_count integer;
begin
  if new.profile_id is null then
    raise exception 'Photo profile_id is required';
  end if;

  if tg_op = 'INSERT' then
    select count(*)
    into v_photo_count
    from public.profile_photos
    where profile_id = new.profile_id;

    if v_photo_count >= 5 then
      raise exception 'A profile can have at most 5 photos';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id then
    select count(*)
    into v_photo_count
    from public.profile_photos
    where profile_id = new.profile_id;

    if v_photo_count >= 5 then
      raise exception 'A profile can have at most 5 photos';
    end if;
  end if;

  if new.is_primary = true then
    update public.profile_photos
    set is_primary = false
    where profile_id = new.profile_id
      and id is distinct from new.id
      and is_primary = true;
  end if;

  return new;
end;
$$;
