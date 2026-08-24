-- Keep the green "active" signal short-lived. Profiles remain "recently active"
-- until the existing 24-hour threshold.
create or replace function public.profile_activity_status(
  p_last_active_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_last_active_at >= now() - interval '5 minutes' then 'active'
    when p_last_active_at >= now() - interval '24 hours' then 'recently_active'
    else null
  end;
$$;

-- The bounded catalog inlines the same threshold for ranking, returned card
-- status, and filtering. Recreate its current definition with the shorter
-- interval without duplicating the full security-definer function here.
do $migration$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.get_bounded_public_profile_cards(text,jsonb,uuid,text,integer,integer,integer,boolean)'::regprocedure
  )
  into v_definition;

  v_updated_definition := replace(
    v_definition,
    'interval ''30 minutes''',
    'interval ''5 minutes'''
  );

  if v_updated_definition = v_definition
    or v_updated_definition like '%interval ''30 minutes''%'
  then
    raise exception 'Could not update the bounded catalog activity threshold';
  end if;

  execute v_updated_definition;
end;
$migration$;
