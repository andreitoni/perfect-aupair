create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_resource_type text check (
    target_resource_type is null or char_length(target_resource_type) between 2 and 80
  ),
  target_resource_id text check (
    target_resource_id is null or char_length(target_resource_id) between 1 and 160
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create index if not exists admin_audit_log_created_at_idx
on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_admin_created_at_idx
on public.admin_audit_log (admin_profile_id, created_at desc)
where admin_profile_id is not null;

create index if not exists admin_audit_log_target_profile_created_at_idx
on public.admin_audit_log (target_profile_id, created_at desc)
where target_profile_id is not null;

grant select, insert, update, delete on table public.admin_audit_log to service_role;
revoke all on table public.admin_audit_log from anon, authenticated;

create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_:-]{2,80}$'),
  enabled boolean not null default true,
  description text not null default '' check (char_length(description) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.feature_flags enable row level security;

grant select, insert, update, delete on table public.feature_flags to service_role;
revoke all on table public.feature_flags from anon, authenticated;

insert into public.feature_flags (key, enabled, description)
values
  ('stories', true, 'Allow users to create and view active stories.'),
  ('uploads', true, 'Allow user-generated media uploads.'),
  ('profile_videos', true, 'Allow optional profile intro video uploads.'),
  ('message_send', true, 'Allow users to send private messages.'),
  ('message_media_uploads', true, 'Allow photo, video, and voice message attachments.'),
  ('ai_moderation', true, 'Allow OpenAI moderation for public profile and story content.'),
  ('clarity', true, 'Allow Microsoft Clarity when optional analytics consent is granted.'),
  ('hotjar', true, 'Allow Hotjar when optional analytics consent is granted.')
on conflict (key) do nothing;

create table if not exists public.security_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) between 3 and 80),
  subject_hash text check (
    subject_hash is null or char_length(subject_hash) between 32 and 128
  ),
  ip_hash text not null check (char_length(ip_hash) between 32 and 128),
  ip_prefix_hash text not null check (char_length(ip_prefix_hash) between 32 and 128),
  user_agent_hash text check (
    user_agent_hash is null or char_length(user_agent_hash) between 32 and 128
  ),
  blocked boolean not null default false,
  challenge_required boolean not null default false,
  reason text,
  retry_after_seconds integer check (
    retry_after_seconds is null or retry_after_seconds >= 0
  ),
  created_at timestamptz not null default now()
);

alter table public.security_rate_limit_events enable row level security;

create index if not exists security_rate_limit_events_created_at_idx
on public.security_rate_limit_events (created_at);

create index if not exists security_rate_limit_events_action_subject_created_idx
on public.security_rate_limit_events (action, subject_hash, created_at desc)
where subject_hash is not null;

create index if not exists security_rate_limit_events_action_ip_created_idx
on public.security_rate_limit_events (action, ip_hash, created_at desc);

create index if not exists security_rate_limit_events_action_ip_prefix_created_idx
on public.security_rate_limit_events (action, ip_prefix_hash, created_at desc);

grant select, insert, update, delete on table public.security_rate_limit_events to service_role;
revoke all on table public.security_rate_limit_events from anon, authenticated;

create table if not exists public.ai_moderation_usage_events (
  id uuid primary key default gen_random_uuid(),
  model text not null check (char_length(model) between 1 and 120),
  input_count integer not null default 0 check (input_count >= 0),
  status text not null check (status in ('attempted', 'succeeded', 'failed', 'limited')),
  error_reason text check (
    error_reason is null or char_length(error_reason) <= 500
  ),
  created_at timestamptz not null default now()
);

alter table public.ai_moderation_usage_events enable row level security;

create index if not exists ai_moderation_usage_events_created_status_idx
on public.ai_moderation_usage_events (created_at desc, status);

grant select, insert, update, delete on table public.ai_moderation_usage_events to service_role;
revoke all on table public.ai_moderation_usage_events from anon, authenticated;

create or replace function public.record_security_rate_limit_event(
  p_action text,
  p_subject_hash text,
  p_ip_hash text,
  p_ip_prefix_hash text,
  p_user_agent_hash text default null
)
returns table (
  allowed boolean,
  challenge_required boolean,
  retry_after_seconds integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_event_id uuid;
  v_subject_window interval := interval '10 minutes';
  v_ip_window interval := interval '10 minutes';
  v_subject_challenge_limit integer := 10;
  v_subject_block_limit integer := 20;
  v_ip_challenge_limit integer := 40;
  v_ip_block_limit integer := 80;
  v_count integer := 0;
  v_oldest timestamptz;
  v_retry integer := 0;
  v_reason text;
  v_challenge_reason text;
begin
  case p_action
    when 'login' then
      v_subject_window := interval '10 minutes';
      v_ip_window := interval '10 minutes';
      v_subject_challenge_limit := 5;
      v_subject_block_limit := 10;
      v_ip_challenge_limit := 20;
      v_ip_block_limit := 40;
    when 'signup' then
      v_subject_window := interval '1 hour';
      v_ip_window := interval '1 hour';
      v_subject_challenge_limit := 2;
      v_subject_block_limit := 4;
      v_ip_challenge_limit := 10;
      v_ip_block_limit := 20;
    when 'password_reset' then
      v_subject_window := interval '1 hour';
      v_ip_window := interval '1 hour';
      v_subject_challenge_limit := 2;
      v_subject_block_limit := 4;
      v_ip_challenge_limit := 6;
      v_ip_block_limit := 15;
    when 'report' then
      v_subject_window := interval '1 hour';
      v_ip_window := interval '1 hour';
      v_subject_challenge_limit := 5;
      v_subject_block_limit := 12;
      v_ip_challenge_limit := 20;
      v_ip_block_limit := 40;
    when 'message_send' then
      v_subject_window := interval '10 minutes';
      v_ip_window := interval '10 minutes';
      v_subject_challenge_limit := 30;
      v_subject_block_limit := 80;
      v_ip_challenge_limit := 80;
      v_ip_block_limit := 160;
    when 'story_upload' then
      v_subject_window := interval '10 minutes';
      v_ip_window := interval '10 minutes';
      v_subject_challenge_limit := 3;
      v_subject_block_limit := 6;
      v_ip_challenge_limit := 20;
      v_ip_block_limit := 50;
    when 'profile_photo_upload' then
      v_subject_window := interval '10 minutes';
      v_ip_window := interval '10 minutes';
      v_subject_challenge_limit := 10;
      v_subject_block_limit := 20;
      v_ip_challenge_limit := 60;
      v_ip_block_limit := 120;
    when 'profile_video_upload' then
      v_subject_window := interval '1 hour';
      v_ip_window := interval '1 hour';
      v_subject_challenge_limit := 2;
      v_subject_block_limit := 5;
      v_ip_challenge_limit := 20;
      v_ip_block_limit := 50;
    when 'message_media_upload' then
      v_subject_window := interval '10 minutes';
      v_ip_window := interval '10 minutes';
      v_subject_challenge_limit := 25;
      v_subject_block_limit := 60;
      v_ip_challenge_limit := 80;
      v_ip_block_limit := 160;
    else
      raise exception 'Unsupported security rate-limit action.';
  end case;

  delete from public.security_rate_limit_events
  where created_at < v_now - interval '30 days';

  insert into public.security_rate_limit_events (
    action,
    subject_hash,
    ip_hash,
    ip_prefix_hash,
    user_agent_hash
  )
  values (
    p_action,
    p_subject_hash,
    p_ip_hash,
    p_ip_prefix_hash,
    p_user_agent_hash
  )
  returning id into v_event_id;

  if p_subject_hash is not null then
    select count(*), min(created_at)
    into v_count, v_oldest
    from public.security_rate_limit_events
    where action = p_action
      and subject_hash = p_subject_hash
      and created_at > v_now - v_subject_window;

    if v_count > v_subject_block_limit then
      v_reason := coalesce(v_reason, 'subject_limit');
      v_retry := greatest(
        v_retry,
        ceil(extract(epoch from ((v_oldest + v_subject_window) - v_now)))::integer
      );
    elsif v_count > v_subject_challenge_limit then
      v_challenge_reason := coalesce(v_challenge_reason, 'subject_challenge');
    end if;
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.security_rate_limit_events
  where action = p_action
    and ip_hash = p_ip_hash
    and created_at > v_now - v_ip_window;

  if v_count > v_ip_block_limit then
    v_reason := coalesce(v_reason, 'ip_limit');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + v_ip_window) - v_now)))::integer
    );
  elsif v_count > v_ip_challenge_limit then
    v_challenge_reason := coalesce(v_challenge_reason, 'ip_challenge');
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.security_rate_limit_events
  where action = p_action
    and ip_prefix_hash = p_ip_prefix_hash
    and created_at > v_now - v_ip_window;

  if v_count > v_ip_block_limit * 2 then
    v_reason := coalesce(v_reason, 'ip_prefix_limit');
    v_retry := greatest(
      v_retry,
      ceil(extract(epoch from ((v_oldest + v_ip_window) - v_now)))::integer
    );
  elsif v_count > v_ip_challenge_limit * 2 then
    v_challenge_reason := coalesce(v_challenge_reason, 'ip_prefix_challenge');
  end if;

  if v_reason is not null then
    v_retry := greatest(v_retry, 60);

    update public.security_rate_limit_events
    set blocked = true,
        reason = v_reason,
        retry_after_seconds = v_retry
    where id = v_event_id;

    return query select false, false, v_retry, v_reason;
    return;
  end if;

  if v_challenge_reason is not null then
    update public.security_rate_limit_events
    set challenge_required = true,
        reason = v_challenge_reason
    where id = v_event_id;

    return query select true, true, 0, v_challenge_reason;
    return;
  end if;

  return query select true, false, 0, null::text;
end;
$$;

revoke all on function public.record_security_rate_limit_event(
  text,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.record_security_rate_limit_event(
  text,
  text,
  text,
  text,
  text
) to service_role;

create or replace function public.storage_upload_rate_limit_ok(
  p_bucket_id text,
  p_folder text,
  p_window interval,
  p_limit integer
)
returns boolean
language sql
security definer
set search_path = public, storage
as $$
  select (
    select count(*)
    from storage.objects so
    where so.bucket_id = p_bucket_id
      and (storage.foldername(so.name))[1] = p_folder
      and so.created_at > now() - p_window
  ) < p_limit;
$$;

revoke all on function public.storage_upload_rate_limit_ok(
  text,
  text,
  interval,
  integer
) from public;

grant execute on function public.storage_upload_rate_limit_ok(
  text,
  text,
  interval,
  integer
) to authenticated, service_role;

drop policy if exists "Users can upload their own profile photo files"
on storage.objects;

create policy "Users can upload their own profile photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.storage_upload_rate_limit_ok(
    'profile-photos',
    (storage.foldername(name))[1],
    interval '10 minutes',
    20
  )
);

drop policy if exists "Users can upload their own profile story files"
on storage.objects;
drop policy if exists "Users can upload own profile story files"
on storage.objects;

create policy "Users can upload own profile story files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-stories'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.storage_upload_rate_limit_ok(
    'profile-stories',
    (storage.foldername(name))[1],
    interval '10 minutes',
    8
  )
);

drop policy if exists "Users can upload own profile video files"
on storage.objects;

create policy "Users can upload own profile video files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.storage_upload_rate_limit_ok(
    'profile-videos',
    (storage.foldername(name))[1],
    interval '1 hour',
    5
  )
);

drop policy if exists "Conversation participants can upload message photo files"
on storage.objects;

create policy "Conversation participants can upload message photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-photos'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
  and public.storage_upload_rate_limit_ok(
    'message-photos',
    (storage.foldername(name))[1],
    interval '10 minutes',
    40
  )
);

drop policy if exists "Conversation participants can upload message video files"
on storage.objects;

create policy "Conversation participants can upload message video files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-videos'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
  and public.storage_upload_rate_limit_ok(
    'message-videos',
    (storage.foldername(name))[1],
    interval '1 hour',
    20
  )
);

drop policy if exists "Conversation participants can upload message audio files"
on storage.objects;

create policy "Conversation participants can upload message audio files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-audio'
  and exists (
    select 1
    from public.conversations c
    where c.id = ((storage.foldername(name))[1])::uuid
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
  )
  and public.storage_upload_rate_limit_ok(
    'message-audio',
    (storage.foldername(name))[1],
    interval '1 hour',
    30
  )
);

drop policy if exists "Users can upload own verification selfies"
on storage.objects;

create policy "Users can upload own verification selfies"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.storage_upload_rate_limit_ok(
    'verification-selfies',
    (storage.foldername(name))[1],
    interval '1 hour',
    10
  )
);
