-- Record proportionate first-incident moderation actions and keep the two
-- profiles separated after a confirmed report without suspending either user.

alter table public.moderation_reports
add column if not exists resolution text;

alter table public.moderation_reports
drop constraint if exists moderation_reports_resolution_check;

alter table public.moderation_reports
add constraint moderation_reports_resolution_check
check (
  resolution is null
  or resolution = 'warning_and_separation'
);

alter table public.profile_blocks
add column if not exists enforced_by_admin boolean not null default false,
add column if not exists enforced_report_id uuid
  references public.moderation_reports(id) on delete restrict,
add column if not exists enforced_by uuid
  references public.profiles(id) on delete set null,
add column if not exists enforced_at timestamptz;

alter table public.profile_blocks
drop constraint if exists profile_blocks_admin_enforcement_metadata_check;

alter table public.profile_blocks
add constraint profile_blocks_admin_enforcement_metadata_check
check (
  (
    enforced_by_admin = false
    and enforced_report_id is null
    and enforced_by is null
    and enforced_at is null
  )
  or (
    enforced_by_admin = true
    and enforced_report_id is not null
    and enforced_at is not null
  )
);

create index if not exists profile_blocks_enforced_report_idx
on public.profile_blocks (enforced_report_id)
where enforced_by_admin = true;

create table if not exists public.profile_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_report_id uuid not null unique
    references public.moderation_reports(id) on delete cascade,
  action_type text not null check (action_type = 'formal_warning'),
  severity text not null check (severity in ('low', 'medium', 'high')),
  policy_area text not null check (char_length(policy_area) between 2 and 80),
  summary text not null check (char_length(summary) between 3 and 500),
  issued_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.profile_moderation_actions enable row level security;

revoke all on table public.profile_moderation_actions
from public, anon, authenticated;
grant select, insert, update, delete
on table public.profile_moderation_actions to service_role;

create index if not exists profile_moderation_actions_profile_created_idx
on public.profile_moderation_actions (profile_id, created_at desc);

-- New resolution fields are server-owned just like the existing review fields.
create or replace function public.prepare_moderation_report_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text := coalesce((select auth.role()), '');
begin
  if
    v_actor_role = 'service_role'
    or (
      v_actor_role = ''
      and session_user in ('postgres', 'supabase_admin')
    )
  then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Report review fields are server-owned'
      using errcode = '42501';
  end if;

  if new.reporter_id <> (select auth.uid()) then
    raise exception 'Reporter identity does not match the authenticated user'
      using errcode = '42501';
  end if;

  if
    new.subject_type <> 'profile'
    or new.reported_profile_id is null
    or new.subject_id <> new.reported_profile_id
  then
    raise exception 'Invalid reported profile reference'
      using errcode = '22023';
  end if;

  new.status := 'open';
  new.resolution := null;
  new.admin_notes := '';
  new.created_at := pg_catalog.clock_timestamp();
  new.reviewed_at := null;
  new.reviewed_by := null;
  return new;
end;
$$;

revoke all on function public.prepare_moderation_report_write()
from public, anon, authenticated, service_role;

-- An admin-enforced row is not a user preference and cannot be removed by the
-- normal unblock RPC. The response stays non-leaking and does not identify who
-- applied the safety action.
create or replace function public.unblock_profile(p_blocked_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_blocked_profile_id is null or p_blocked_profile_id = v_user_id then
    raise exception 'Invalid profile';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_blocked_profile_id
  ) then
    raise exception 'Profile not found';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where (
      conversation.family_id = v_user_id
      and conversation.au_pair_id = p_blocked_profile_id
    ) or (
      conversation.au_pair_id = v_user_id
      and conversation.family_id = p_blocked_profile_id
    )
  ) and not exists (
    select 1 from public.profile_blocks block
    where block.blocker_id = v_user_id
      and block.blocked_profile_id = p_blocked_profile_id
  ) then
    raise exception 'Conversation not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'profile-block:' || v_user_id::text || ':' || p_blocked_profile_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.profile_blocks block
    where block.blocker_id = v_user_id
      and block.blocked_profile_id = p_blocked_profile_id
      and block.enforced_by_admin = true
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'error_code', 'moderation_separation'
    );
  end if;

  if not exists (
    select 1 from public.profile_blocks block
    where block.blocker_id = v_user_id
      and block.blocked_profile_id = p_blocked_profile_id
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'changed', false);
  end if;

  if not public.consume_profile_safety_action_budget(v_user_id) then
    raise exception 'Safety action limit reached' using errcode = 'P0001';
  end if;

  delete from public.profile_blocks block
  where block.blocker_id = v_user_id
    and block.blocked_profile_id = p_blocked_profile_id
    and block.enforced_by_admin = false;

  insert into public.profile_block_events (
    blocker_id,
    blocked_profile_id,
    action
  ) values (v_user_id, p_blocked_profile_id, 'unblocked');

  return pg_catalog.jsonb_build_object('ok', true, 'changed', true);
end;
$$;

revoke all on function public.unblock_profile(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.unblock_profile(uuid) to authenticated;

create or replace function public.apply_report_warning_and_separation(
  p_report_id uuid,
  p_admin_profile_id uuid,
  p_admin_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.moderation_reports%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_notes text := pg_catalog.btrim(coalesce(p_admin_notes, ''));
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_report_id is null or p_admin_profile_id is null then
    raise exception 'Report and admin are required' using errcode = '22023';
  end if;

  if pg_catalog.char_length(v_notes) > 1200 then
    raise exception 'Admin notes are too long' using errcode = '22001';
  end if;

  if not exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = p_admin_profile_id
      and coalesce(admin_profile.is_admin, false) = true
  ) then
    raise exception 'Admin profile required' using errcode = '42501';
  end if;

  select report.*
  into v_report
  from public.moderation_reports report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  if v_report.status = 'reviewed'
    and v_report.resolution = 'warning_and_separation'
  then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'changed', false,
      'reporter_id', v_report.reporter_id,
      'reported_profile_id', v_report.reported_profile_id
    );
  end if;

  if v_report.status <> 'open' or v_report.resolution is not null then
    raise exception 'Report has already been resolved' using errcode = 'P0001';
  end if;

  if v_report.reporter_id is null
    or v_report.reported_profile_id is null
    or v_report.reporter_id = v_report.reported_profile_id
  then
    raise exception 'Report profiles are unavailable' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.profiles reported_profile
    where reported_profile.id = v_report.reported_profile_id
      and coalesce(reported_profile.is_admin, false) = false
  ) then
    raise exception 'Reported profile cannot be moderated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.profiles reporter_profile
    where reporter_profile.id = v_report.reporter_id
  ) then
    raise exception 'Reporter profile is unavailable' using errcode = 'P0001';
  end if;

  insert into public.profile_moderation_actions (
    profile_id,
    source_report_id,
    action_type,
    severity,
    policy_area,
    summary,
    issued_by,
    created_at
  ) values (
    v_report.reported_profile_id,
    v_report.id,
    'formal_warning',
    'medium',
    coalesce(nullif(v_report.category, ''), 'harassment'),
    v_report.reason,
    p_admin_profile_id,
    v_now
  );

  insert into public.profile_blocks (
    blocker_id,
    blocked_profile_id,
    created_at,
    enforced_by_admin,
    enforced_report_id,
    enforced_by,
    enforced_at
  ) values (
    v_report.reporter_id,
    v_report.reported_profile_id,
    v_now,
    true,
    v_report.id,
    p_admin_profile_id,
    v_now
  )
  on conflict (blocker_id, blocked_profile_id) do update
  set
    enforced_by_admin = true,
    enforced_report_id = excluded.enforced_report_id,
    enforced_by = excluded.enforced_by,
    enforced_at = excluded.enforced_at;

  update public.moderation_reports report
  set
    status = 'reviewed',
    resolution = 'warning_and_separation',
    admin_notes = coalesce(
      nullif(v_notes, ''),
      'Confirmed violation. Formal warning and enforced separation applied.'
    ),
    reviewed_at = v_now,
    reviewed_by = p_admin_profile_id
  where report.id = v_report.id;

  insert into public.system_notifications (
    recipient_id,
    type,
    title,
    body,
    action_href,
    dedupe_key,
    created_at
  ) values (
    v_report.reporter_id,
    'report_action_taken',
    'We took action on your report',
    'Thank you for reporting this. We reviewed the interaction and took action under our safety rules. This member can no longer contact you or see your profile, and you will no longer see theirs. For privacy and safety reasons, we cannot share the exact account action.',
    '/messages',
    'report_action_taken:' || v_report.id::text,
    v_now
  ), (
    v_report.reported_profile_id,
    'conduct_warning',
    'Warning about your conduct',
    'A recent interaction was reviewed and found not to meet our community standards. Do not pressure, control, or manipulate other members. Further violations may result in temporary suspension or permanent removal from Perfect AuPair.',
    '/safety',
    'conduct_warning:' || v_report.id::text,
    v_now
  )
  on conflict (dedupe_key) do nothing;

  insert into public.admin_audit_log (
    admin_profile_id,
    action,
    target_profile_id,
    target_resource_type,
    target_resource_id,
    metadata,
    created_at
  ) values (
    p_admin_profile_id,
    'confirm_report_violation_and_separate',
    v_report.reported_profile_id,
    'moderation_report',
    v_report.id::text,
    pg_catalog.jsonb_build_object(
      'resolution', 'warning_and_separation',
      'severity', 'medium',
      'formalWarning', true,
      'enforcedSeparation', true,
      'suspended', false
    ),
    v_now
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'changed', true,
    'reporter_id', v_report.reporter_id,
    'reported_profile_id', v_report.reported_profile_id
  );
end;
$$;

revoke all on function public.apply_report_warning_and_separation(uuid, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.apply_report_warning_and_separation(uuid, uuid, text)
to service_role;
