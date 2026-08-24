create table if not exists public.profile_notification_reads (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  profile_views_read_at timestamptz,
  profile_favorites_read_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profile_notification_reads enable row level security;

drop policy if exists "Users can read own profile notification state" on public.profile_notification_reads;
create policy "Users can read own profile notification state"
on public.profile_notification_reads
for select
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "Users can insert own profile notification state" on public.profile_notification_reads;
create policy "Users can insert own profile notification state"
on public.profile_notification_reads
for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "Users can update own profile notification state" on public.profile_notification_reads;
create policy "Users can update own profile notification state"
on public.profile_notification_reads
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create index if not exists profile_notification_reads_updated_idx
on public.profile_notification_reads (updated_at desc);

revoke all on table public.profile_notification_reads from anon, authenticated;
grant select, insert, update on public.profile_notification_reads to authenticated;
grant all on public.profile_notification_reads to service_role;

create or replace function public.mark_profile_activity_notifications_read(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_kind text := lower(coalesce(p_kind, ''));
begin
  if v_profile_id is null then
    return;
  end if;

  if v_kind = 'views' then
    insert into public.profile_notification_reads (
      profile_id,
      profile_views_read_at,
      updated_at
    )
    values (
      v_profile_id,
      now(),
      now()
    )
    on conflict (profile_id)
    do update set
      profile_views_read_at = excluded.profile_views_read_at,
      updated_at = excluded.updated_at;
  elsif v_kind = 'saved' then
    insert into public.profile_notification_reads (
      profile_id,
      profile_favorites_read_at,
      updated_at
    )
    values (
      v_profile_id,
      now(),
      now()
    )
    on conflict (profile_id)
    do update set
      profile_favorites_read_at = excluded.profile_favorites_read_at,
      updated_at = excluded.updated_at;
  end if;
end;
$$;

revoke all on function public.mark_profile_activity_notifications_read(text) from public, anon;
grant execute on function public.mark_profile_activity_notifications_read(text) to authenticated;

create or replace function public.get_profile_notification_summary()
returns table (
  profile_view_count bigint,
  profile_view_latest_at timestamptz,
  profile_favorite_count bigint,
  profile_favorite_latest_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  with current_profile as (
    select
      p.id,
      p.account_type,
      coalesce(nr.profile_views_read_at, '-infinity'::timestamptz) as profile_views_read_at,
      coalesce(nr.profile_favorites_read_at, '-infinity'::timestamptz) as profile_favorites_read_at
    from public.profiles p
    left join public.profile_notification_reads nr
      on nr.profile_id = p.id
    where p.id = (select auth.uid())
      and p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
  )
  select
    coalesce((
      select count(*)
      from public.profile_views pv
      join public.profiles actor
        on actor.id = pv.viewer_id
      where pv.profile_id = cp.id
        and pv.last_viewed_at > cp.profile_views_read_at
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ), 0)::bigint as profile_view_count,
    (
      select max(pv.last_viewed_at)
      from public.profile_views pv
      join public.profiles actor
        on actor.id = pv.viewer_id
      where pv.profile_id = cp.id
        and pv.last_viewed_at > cp.profile_views_read_at
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ) as profile_view_latest_at,
    coalesce((
      select count(*)
      from public.profile_favorites pf
      join public.profiles actor
        on actor.id = pf.user_id
      where pf.profile_id = cp.id
        and pf.created_at > cp.profile_favorites_read_at
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ), 0)::bigint as profile_favorite_count,
    (
      select max(pf.created_at)
      from public.profile_favorites pf
      join public.profiles actor
        on actor.id = pf.user_id
      where pf.profile_id = cp.id
        and pf.created_at > cp.profile_favorites_read_at
        and actor.onboarding_completed = true
        and actor.account_type <> cp.account_type
        and actor.public_slug is not null
        and actor.suspended_at is null
        and actor.deletion_requested_at is null
        and actor.content_moderation_status = 'approved'
        and coalesce(actor.is_admin, false) = false
        and not public.profile_pair_blocked(cp.id, actor.id)
    ) as profile_favorite_latest_at
  from current_profile cp
  union all
  select 0::bigint, null::timestamptz, 0::bigint, null::timestamptz
  where not exists (select 1 from current_profile);
$$;

revoke all on function public.get_profile_notification_summary() from public, anon;
grant execute on function public.get_profile_notification_summary() to authenticated;
