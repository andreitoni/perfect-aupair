create or replace function public.profile_activity_status(p_last_active_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_last_active_at >= now() - interval '30 minutes' then 'active'
    when p_last_active_at >= now() - interval '24 hours' then 'recently_active'
    else null
  end;
$$;

update public.profiles
set last_active_at = now()
  - interval '35 minutes'
  - ((random() * 22 * 60 * 60)::integer * interval '1 second')
where onboarding_completed = true
  and public_slug is not null
  and suspended_at is null
  and coalesce(is_admin, false) = false
  and public.profile_activity_status(last_active_at) is null;
