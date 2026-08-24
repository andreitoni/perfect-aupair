create or replace function public.toggle_profile_favorite(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_viewer_type text;
  v_target_type text;
  v_exists boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_user_id = p_profile_id then
    raise exception 'You cannot save your own profile';
  end if;

  select account_type
  into v_viewer_type
  from public.profiles
  where id = v_user_id
    and onboarding_completed = true;

  if v_viewer_type is null then
    raise exception 'Viewer profile not found';
  end if;

  select account_type
  into v_target_type
  from public.profiles
  where id = p_profile_id
    and onboarding_completed = true;

  if v_target_type is null then
    raise exception 'Target profile not found';
  end if;

  if v_viewer_type = v_target_type then
    raise exception 'You can only save opposite profile types';
  end if;

  select exists (
    select 1
    from public.profile_favorites
    where user_id = v_user_id
      and profile_id = p_profile_id
  )
  into v_exists;

  if v_exists then
    delete from public.profile_favorites
    where user_id = v_user_id
      and profile_id = p_profile_id;

    return false;
  end if;

  insert into public.profile_favorites (
    user_id,
    profile_id
  )
  values (
    v_user_id,
    p_profile_id
  );

  return true;
end;
$$;

grant execute on function public.toggle_profile_favorite(uuid) to authenticated;
