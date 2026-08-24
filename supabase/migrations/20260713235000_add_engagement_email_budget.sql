-- Keep optional engagement email costs finite without consuming the separate
-- auth, account-deletion, and security email capacity.

insert into public.feature_flags (key, enabled, description)
values (
  'engagement_emails',
  true,
  'Allow bounded first-message and profile-favorite notification emails.'
)
on conflict (key) do nothing;

create table if not exists public.engagement_email_daily_usage (
  usage_date date not null,
  category text not null check (category in ('new_message', 'profile_favorite')),
  send_count integer not null default 0 check (send_count >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (usage_date, category)
);

alter table public.engagement_email_daily_usage enable row level security;
revoke all on table public.engagement_email_daily_usage
from public, anon, authenticated;
grant select, insert, update, delete
on table public.engagement_email_daily_usage to service_role;

create or replace function public.reserve_engagement_email_budget(
  p_category text,
  p_daily_limit integer default 500
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_total integer;
  v_category_count integer;
  v_category_limit integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_category not in ('new_message', 'profile_favorite')
    or p_daily_limit is null
    or p_daily_limit < 1
    or p_daily_limit > 500
  then
    return false;
  end if;

  if not coalesce((
    select flag.enabled
    from public.feature_flags flag
    where flag.key = 'engagement_emails'
  ), false) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'engagement-email-budget:' || v_today::text,
      0
    )
  );

  delete from public.engagement_email_daily_usage usage
  where usage.usage_date < v_today - 30;

  select coalesce(pg_catalog.sum(usage.send_count), 0)::integer
  into v_total
  from public.engagement_email_daily_usage usage
  where usage.usage_date = v_today;

  select coalesce(usage.send_count, 0)
  into v_category_count
  from public.engagement_email_daily_usage usage
  where usage.usage_date = v_today
    and usage.category = p_category;

  v_category_count := coalesce(v_category_count, 0);
  v_category_limit := case p_category
    when 'new_message' then greatest(1, pg_catalog.floor(p_daily_limit * 0.7)::integer)
    else greatest(1, p_daily_limit - pg_catalog.floor(p_daily_limit * 0.7)::integer)
  end;

  if v_total >= p_daily_limit or v_category_count >= v_category_limit then
    return false;
  end if;

  insert into public.engagement_email_daily_usage (
    usage_date,
    category,
    send_count,
    updated_at
  )
  values (v_today, p_category, 1, pg_catalog.clock_timestamp())
  on conflict (usage_date, category) do update
  set
    send_count = engagement_email_daily_usage.send_count + 1,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.reserve_engagement_email_budget(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_engagement_email_budget(text, integer)
to service_role;
