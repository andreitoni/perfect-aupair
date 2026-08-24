alter table public.messages
add column if not exists sent_at timestamptz;

alter table public.messages
add column if not exists order_key bigint;

update public.messages
set sent_at = created_at
where sent_at is null;

create sequence if not exists public.message_send_order_seq as bigint;

with ordered_messages as (
  select
    id,
    row_number() over (order by created_at asc, id asc)::bigint as order_key
  from public.messages
)
update public.messages message
set order_key = ordered.order_key
from ordered_messages ordered
where message.id = ordered.id
  and message.order_key is null;

select setval(
  'public.message_send_order_seq',
  greatest(coalesce((select max(order_key) from public.messages), 0), 1),
  true
);

alter table public.messages
alter column sent_at set default now();

alter table public.messages
alter column sent_at set not null;

alter table public.messages
alter column order_key set default nextval('public.message_send_order_seq');

alter table public.messages
alter column order_key set not null;

create index if not exists messages_conversation_order_key_idx
on public.messages (conversation_id, order_key, created_at, id);

revoke all on sequence public.message_send_order_seq from anon;
grant usage on sequence public.message_send_order_seq to authenticated;

create table if not exists public.message_send_slots (
  message_id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  order_key bigint not null default nextval('public.message_send_order_seq'),
  sent_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists message_send_slots_sender_created_at_idx
on public.message_send_slots (sender_id, created_at);

create index if not exists message_send_slots_created_at_idx
on public.message_send_slots (created_at);

alter table public.message_send_slots enable row level security;

revoke all on table public.message_send_slots from anon, authenticated;

create or replace function public.reserve_message_send_slot(
  p_conversation_id uuid,
  p_message_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_slot public.message_send_slots%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_conversation_id is null or p_message_id is null then
    raise exception 'Invalid message reservation';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.family_id = v_user_id or c.au_pair_id = v_user_id)
  ) then
    raise exception 'Conversation not found';
  end if;

  if exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and public.profile_pair_blocked(c.family_id, c.au_pair_id)
  ) then
    raise exception 'This conversation is blocked.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_conversation_id::text, 0)
  );

  delete from public.message_send_slots
  where created_at < clock_timestamp() - interval '1 day';

  select *
  into v_slot
  from public.message_send_slots
  where message_id = p_message_id;

  if found then
    if v_slot.sender_id <> v_user_id
      or v_slot.conversation_id <> p_conversation_id then
      raise exception 'Invalid message reservation';
    end if;

    return v_slot.sent_at;
  end if;

  if (
    select count(*)
    from public.message_send_slots
    where sender_id = v_user_id
  ) >= 100 then
    raise exception 'Too many pending messages';
  end if;

  insert into public.message_send_slots (
    message_id,
    conversation_id,
    sender_id
  )
  values (
    p_message_id,
    p_conversation_id,
    v_user_id
  )
  returning * into v_slot;

  return v_slot.sent_at;
end;
$$;

revoke all on function public.reserve_message_send_slot(uuid, uuid) from public;
grant execute on function public.reserve_message_send_slot(uuid, uuid) to authenticated;

create or replace function public.cancel_message_send_slot(
  p_conversation_id uuid,
  p_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.message_send_slots
  where message_id = p_message_id
    and conversation_id = p_conversation_id
    and sender_id = auth.uid()
  returning true into v_deleted;

  return coalesce(v_deleted, false);
end;
$$;

revoke all on function public.cancel_message_send_slot(uuid, uuid) from public;
grant execute on function public.cancel_message_send_slot(uuid, uuid) to authenticated;

create or replace function public.assign_reserved_message_sent_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved_sent_at timestamptz;
  v_reserved_order_key bigint;
begin
  if auth.uid() is null then
    return new;
  end if;

  delete from public.message_send_slots
  where message_id = new.id
    and conversation_id = new.conversation_id
    and sender_id = new.sender_id
  returning sent_at, order_key
  into v_reserved_sent_at, v_reserved_order_key;

  new.sent_at = coalesce(v_reserved_sent_at, clock_timestamp());
  new.order_key = coalesce(
    v_reserved_order_key,
    nextval('public.message_send_order_seq')
  );
  return new;
end;
$$;

drop trigger if exists assign_reserved_message_sent_at_trigger on public.messages;

create trigger assign_reserved_message_sent_at_trigger
before insert on public.messages
for each row
execute function public.assign_reserved_message_sent_at();

create or replace function public.preserve_message_order_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.id = old.id;
    new.conversation_id = old.conversation_id;
    new.sender_id = old.sender_id;
    new.created_at = old.created_at;
    new.sent_at = old.sent_at;
    new.order_key = old.order_key;
  end if;

  return new;
end;
$$;

drop trigger if exists preserve_message_order_fields_trigger on public.messages;

create trigger preserve_message_order_fields_trigger
before update on public.messages
for each row
execute function public.preserve_message_order_fields();

create table if not exists public.message_notification_claims (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  claimed_at timestamptz not null default clock_timestamp(),
  email_claimed_at timestamptz,
  primary key (conversation_id, sender_id)
);

insert into public.message_notification_claims (
  conversation_id,
  sender_id,
  message_id,
  claimed_at,
  email_claimed_at
)
select distinct on (message.conversation_id, message.sender_id)
  message.conversation_id,
  message.sender_id,
  message.id,
  message.created_at,
  message.created_at
from public.messages message
order by
  message.conversation_id,
  message.sender_id,
  message.created_at,
  message.id
on conflict (conversation_id, sender_id) do nothing;

alter table public.message_notification_claims enable row level security;

revoke all on table public.message_notification_claims from anon, authenticated;

create or replace function public.register_first_sender_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.message_notification_claims (
    conversation_id,
    sender_id,
    message_id
  )
  values (
    new.conversation_id,
    new.sender_id,
    new.id
  )
  on conflict (conversation_id, sender_id) do nothing;

  return new;
end;
$$;

drop trigger if exists register_first_sender_message_trigger on public.messages;

create trigger register_first_sender_message_trigger
after insert on public.messages
for each row
execute function public.register_first_sender_message();

create or replace function public.claim_new_message_notification(
  p_conversation_id uuid,
  p_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_claimed boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.messages message
    where message.id = p_message_id
      and message.conversation_id = p_conversation_id
      and message.sender_id = v_user_id
  ) then
    raise exception 'Message not found';
  end if;

  update public.message_notification_claims
  set email_claimed_at = clock_timestamp()
  where conversation_id = p_conversation_id
    and sender_id = v_user_id
    and message_id = p_message_id
    and email_claimed_at is null
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_new_message_notification(uuid, uuid) from public;
grant execute on function public.claim_new_message_notification(uuid, uuid)
to authenticated;

drop function if exists public.get_message_inbox_cards();

create function public.get_message_inbox_cards()
returns table (
  conversation_id uuid,
  family_id uuid,
  au_pair_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz,
  activity_at timestamptz,
  other_profile_id uuid,
  other_account_type text,
  other_public_slug text,
  other_full_name text,
  other_country text,
  other_city text,
  other_primary_photo_path text,
  other_activity_status text,
  other_verification_status text,
  last_message_id uuid,
  last_message_sender_id uuid,
  last_message_body text,
  last_message_image_path text,
  last_message_image_mime_type text,
  last_message_video_path text,
  last_message_video_mime_type text,
  last_message_audio_path text,
  last_message_audio_mime_type text,
  last_message_created_at timestamptz,
  last_message_read_by_other boolean,
  unread_count integer
)
language sql
security definer
set search_path = public
as $$
  with viewer_conversations as (
    select
      c.id,
      c.family_id,
      c.au_pair_id,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      greatest(
        c.created_at,
        coalesce(c.updated_at, c.created_at),
        coalesce(c.last_message_at, c.created_at)
      ) as activity_at,
      cr.hidden_at
    from public.conversations c
    left join public.conversation_reads cr
      on cr.user_id = auth.uid()
     and cr.conversation_id = c.id
    where auth.uid() is not null
      and (
        c.family_id = auth.uid()
        or c.au_pair_id = auth.uid()
      )
  )
  select
    vc.id as conversation_id,
    vc.family_id,
    vc.au_pair_id,
    vc.created_at,
    vc.updated_at,
    vc.last_message_at,
    vc.activity_at,
    p.id as other_profile_id,
    p.account_type as other_account_type,
    p.public_slug as other_public_slug,
    p.full_name as other_full_name,
    p.country as other_country,
    p.city as other_city,
    primary_photo.storage_path as other_primary_photo_path,
    public.profile_activity_status(p.last_active_at) as other_activity_status,
    p.verification_status as other_verification_status,
    last_message.id as last_message_id,
    last_message.sender_id as last_message_sender_id,
    last_message.body as last_message_body,
    last_message.image_path as last_message_image_path,
    last_message.image_mime_type as last_message_image_mime_type,
    last_message.video_path as last_message_video_path,
    last_message.video_mime_type as last_message_video_mime_type,
    last_message.audio_path as last_message_audio_path,
    last_message.audio_mime_type as last_message_audio_mime_type,
    last_message.sent_at as last_message_created_at,
    coalesce(
      last_message.sender_id = auth.uid()
      and other_read.last_read_at >= last_message.created_at,
      false
    ) as last_message_read_by_other,
    (
      select count(*)::integer
      from public.messages unread_message
      left join public.conversation_reads unread_read
        on unread_read.user_id = auth.uid()
       and unread_read.conversation_id = unread_message.conversation_id
      where unread_message.conversation_id = vc.id
        and unread_message.sender_id <> auth.uid()
        and unread_message.created_at > coalesce(
          unread_read.last_read_at,
          '1970-01-01'::timestamptz
        )
        and unread_message.created_at > coalesce(
          unread_read.hidden_at,
          '1970-01-01'::timestamptz
        )
    ) as unread_count
  from viewer_conversations vc
  join public.profiles p
    on p.id = case
      when vc.family_id = auth.uid() then vc.au_pair_id
      else vc.family_id
    end
  left join public.conversation_reads other_read
    on other_read.user_id = p.id
   and other_read.conversation_id = vc.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  left join lateral (
    select
      id,
      sender_id,
      body,
      image_path,
      image_mime_type,
      video_path,
      video_mime_type,
      audio_path,
      audio_mime_type,
      created_at,
      sent_at,
      order_key
    from public.messages
    where conversation_id = vc.id
      and (
        vc.hidden_at is null
        or created_at > vc.hidden_at
      )
    order by order_key desc
    limit 1
  ) last_message on true
  where (vc.hidden_at is null or vc.activity_at > vc.hidden_at)
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  order by vc.activity_at desc;
$$;

grant execute on function public.get_message_inbox_cards() to authenticated;
