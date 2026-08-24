alter table public.moderation_reports
add column if not exists category text not null default 'other';

alter table public.moderation_reports
drop constraint if exists moderation_reports_category_check;

alter table public.moderation_reports
add constraint moderation_reports_category_check
check (
  category in (
    'fake_profile',
    'inappropriate_content',
    'spam_scam',
    'harassment_safety',
    'privacy',
    'other'
  )
);

create table if not exists public.account_risk_flags (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  flag_type text not null check (
    flag_type in (
      'new_account_message_burst',
      'new_account_many_conversations'
    )
  ),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  reason text not null check (char_length(reason) between 3 and 240),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

alter table public.account_risk_flags enable row level security;

create index if not exists account_risk_flags_status_created_at_idx
on public.account_risk_flags (status, created_at desc);

create index if not exists account_risk_flags_profile_created_at_idx
on public.account_risk_flags (profile_id, created_at desc);

grant all on table public.account_risk_flags to service_role;

create or replace function public.create_message_risk_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_created_at timestamptz;
  v_is_admin boolean;
  v_message_count_10m integer;
  v_distinct_conversations_30m integer;
begin
  select p.created_at, coalesce(p.is_admin, false)
  into v_profile_created_at, v_is_admin
  from public.profiles p
  where p.id = new.sender_id;

  if v_profile_created_at is null or v_is_admin then
    return new;
  end if;

  if v_profile_created_at < now() - interval '7 days' then
    return new;
  end if;

  select count(*)
  into v_message_count_10m
  from public.messages m
  where m.sender_id = new.sender_id
    and m.created_at > now() - interval '10 minutes';

  select count(distinct m.conversation_id)
  into v_distinct_conversations_30m
  from public.messages m
  where m.sender_id = new.sender_id
    and m.created_at > now() - interval '30 minutes';

  if v_message_count_10m >= 12 and not exists (
    select 1
    from public.account_risk_flags f
    where f.profile_id = new.sender_id
      and f.flag_type = 'new_account_message_burst'
      and f.status = 'open'
      and f.created_at > now() - interval '6 hours'
  ) then
    insert into public.account_risk_flags (
      profile_id,
      flag_type,
      severity,
      reason,
      metadata
    )
    values (
      new.sender_id,
      'new_account_message_burst',
      'high',
      'New account sent many messages in a short time window.',
      jsonb_build_object(
        'message_count_10m', v_message_count_10m,
        'threshold', 12,
        'window', '10 minutes',
        'message_id', new.id,
        'conversation_id', new.conversation_id
      )
    );
  end if;

  if v_distinct_conversations_30m >= 5 and not exists (
    select 1
    from public.account_risk_flags f
    where f.profile_id = new.sender_id
      and f.flag_type = 'new_account_many_conversations'
      and f.status = 'open'
      and f.created_at > now() - interval '6 hours'
  ) then
    insert into public.account_risk_flags (
      profile_id,
      flag_type,
      severity,
      reason,
      metadata
    )
    values (
      new.sender_id,
      'new_account_many_conversations',
      'high',
      'New account contacted many different conversations quickly.',
      jsonb_build_object(
        'distinct_conversations_30m', v_distinct_conversations_30m,
        'threshold', 5,
        'window', '30 minutes',
        'message_id', new.id,
        'conversation_id', new.conversation_id
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists create_message_risk_flags_trigger on public.messages;

create trigger create_message_risk_flags_trigger
after insert on public.messages
for each row
execute function public.create_message_risk_flags();
