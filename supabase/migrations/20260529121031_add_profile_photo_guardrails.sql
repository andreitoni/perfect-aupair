-- Keep only one primary photo per profile in existing data.
with ranked_photos as (
  select
    id,
    row_number() over (
      partition by profile_id
      order by is_primary desc, sort_order asc, created_at asc
    ) as photo_rank
  from public.profile_photos
)
update public.profile_photos p
set is_primary = ranked_photos.photo_rank = 1
from ranked_photos
where p.id = ranked_photos.id;

-- If any profile somehow has more than 5 photos, keep the first 5 ordered photos.
with ranked_photos as (
  select
    id,
    row_number() over (
      partition by profile_id
      order by is_primary desc, sort_order asc, created_at asc
    ) as photo_rank
  from public.profile_photos
)
delete from public.profile_photos p
using ranked_photos
where p.id = ranked_photos.id
  and ranked_photos.photo_rank > 5;

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

drop trigger if exists validate_profile_photo_guardrails_trigger on public.profile_photos;

create trigger validate_profile_photo_guardrails_trigger
before insert or update of profile_id, is_primary on public.profile_photos
for each row
execute function public.validate_profile_photo_guardrails();

drop index if exists profile_photos_one_primary_per_profile_idx;

create unique index profile_photos_one_primary_per_profile_idx
on public.profile_photos (profile_id)
where is_primary = true;
