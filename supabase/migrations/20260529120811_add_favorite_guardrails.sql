delete from public.profile_favorites a
using public.profile_favorites b
where a.ctid < b.ctid
  and a.user_id = b.user_id
  and a.profile_id = b.profile_id;

delete from public.profile_favorites pf
using public.profiles viewer, public.profiles saved
where pf.user_id = viewer.id
  and pf.profile_id = saved.id
  and (
    pf.user_id = pf.profile_id
    or viewer.account_type = saved.account_type
  );

create unique index if not exists profile_favorites_user_profile_unique_idx
on public.profile_favorites (user_id, profile_id);

create or replace function public.validate_profile_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_type text;
  v_saved_type text;
begin
  if new.user_id is null or new.profile_id is null then
    raise exception 'Favorite user and profile are required';
  end if;

  if new.user_id = new.profile_id then
    raise exception 'Users cannot save their own profile';
  end if;

  select account_type
  into v_viewer_type
  from public.profiles
  where id = new.user_id;

  select account_type
  into v_saved_type
  from public.profiles
  where id = new.profile_id;

  if v_viewer_type is null then
    raise exception 'Viewer profile not found';
  end if;

  if v_saved_type is null then
    raise exception 'Saved profile not found';
  end if;

  if v_viewer_type = v_saved_type then
    raise exception 'Users can only save opposite profile types';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_profile_favorite_trigger on public.profile_favorites;

create trigger validate_profile_favorite_trigger
before insert or update of user_id, profile_id on public.profile_favorites
for each row
execute function public.validate_profile_favorite();
