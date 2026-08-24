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

drop trigger if exists enforce_profile_photo_limit_trigger on public.profile_photos;

create trigger enforce_profile_photo_limit_trigger
before insert on public.profile_photos
for each row
execute function public.enforce_profile_photo_limit();
