alter table public.profiles
add column if not exists verification_status text not null default 'unverified',
add column if not exists verification_requested_at timestamptz,
add column if not exists verification_reviewed_at timestamptz,
add column if not exists verification_rejected_reason text;

alter table public.profiles
drop constraint if exists profiles_verification_status_valid;

alter table public.profiles
add constraint profiles_verification_status_valid
check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));

create index if not exists profiles_verification_status_idx
on public.profiles (verification_status)
where verification_status <> 'unverified';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-selfies',
  'verification-selfies',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.profile_verification_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  selfie_path text not null,
  status text not null default 'pending',
  reviewer_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint profile_verification_requests_status_valid
    check (status in ('pending', 'verified', 'rejected'))
);

alter table public.profile_verification_requests enable row level security;

drop policy if exists "Users can create own verification requests" on public.profile_verification_requests;
create policy "Users can create own verification requests"
on public.profile_verification_requests
for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "Users can read own verification requests" on public.profile_verification_requests;
create policy "Users can read own verification requests"
on public.profile_verification_requests
for select
to authenticated
using (profile_id = (select auth.uid()));

create index if not exists profile_verification_requests_profile_created_idx
on public.profile_verification_requests (profile_id, created_at desc);

create index if not exists profile_verification_requests_status_created_idx
on public.profile_verification_requests (status, created_at desc);

drop policy if exists "Users can upload own verification selfies" on storage.objects;
create policy "Users can upload own verification selfies"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can read own verification selfies" on storage.objects;
create policy "Users can read own verification selfies"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create table if not exists public.profile_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_profile_id),
  constraint profile_blocks_not_self check (blocker_id <> blocked_profile_id)
);

alter table public.profile_blocks enable row level security;

drop policy if exists "Users can manage own profile blocks" on public.profile_blocks;
create policy "Users can manage own profile blocks"
on public.profile_blocks
for all
to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

create index if not exists profile_blocks_blocked_profile_idx
on public.profile_blocks (blocked_profile_id);

create or replace function public.profile_pair_blocked(
  p_first_profile_id uuid,
  p_second_profile_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_blocks b
    where (
      b.blocker_id = p_first_profile_id
      and b.blocked_profile_id = p_second_profile_id
    ) or (
      b.blocker_id = p_second_profile_id
      and b.blocked_profile_id = p_first_profile_id
    )
  );
$$;

grant execute on function public.profile_pair_blocked(uuid, uuid) to authenticated;

drop policy if exists "Conversation participants can send messages" on public.messages;
create policy "Conversation participants can send messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.family_id = (select auth.uid())
        or c.au_pair_id = (select auth.uid())
      )
      and not public.profile_pair_blocked(c.family_id, c.au_pair_id)
  )
);

create or replace function public.create_or_get_conversation(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile_id uuid := (select auth.uid());
  current_type text;
  target_type text;
  v_family_id uuid;
  v_au_pair_id uuid;
  v_conversation_id uuid;
begin
  if current_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_profile_id = current_profile_id then
    raise exception 'You cannot message yourself';
  end if;

  if public.profile_pair_blocked(current_profile_id, p_profile_id) then
    raise exception 'This profile cannot receive messages from you';
  end if;

  select account_type
  into current_type
  from public.profiles
  where id = current_profile_id
    and onboarding_completed = true
    and suspended_at is null
    and deletion_requested_at is null
    and coalesce(is_admin, false) = false;

  select account_type
  into target_type
  from public.profiles
  where id = p_profile_id
    and onboarding_completed = true
    and suspended_at is null
    and deletion_requested_at is null
    and coalesce(is_admin, false) = false;

  if current_type is null then
    raise exception 'Your profile is not complete';
  end if;

  if target_type is null then
    raise exception 'Target profile is not available';
  end if;

  if current_type = target_type then
    raise exception 'You can only message the opposite account type';
  end if;

  if current_type = 'family' and target_type = 'au_pair' then
    v_family_id := current_profile_id;
    v_au_pair_id := p_profile_id;
  elsif current_type = 'au_pair' and target_type = 'family' then
    v_family_id := p_profile_id;
    v_au_pair_id := current_profile_id;
  else
    raise exception 'Invalid account types';
  end if;

  insert into public.conversations (family_id, au_pair_id)
  values (v_family_id, v_au_pair_id)
  on conflict (family_id, au_pair_id)
  do update set updated_at = now()
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

grant execute on function public.create_or_get_conversation(uuid) to authenticated;

drop function if exists public.get_au_pair_search_cards();
drop function if exists public.get_family_search_cards();
drop function if exists public.get_public_profile_by_identifier(text);
drop function if exists public.get_public_profile(uuid);

create function public.get_au_pair_search_cards()
returns table (
  id uuid,
  public_slug text,
  created_at timestamptz,
  full_name text,
  country text,
  city text,
  nationality text,
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  smoking_status text,
  gender text,
  age integer,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text,
  verification_status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.public_slug,
    p.created_at,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    case
      when coalesce(p.birth_date, p.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(p.birth_date, p.date_of_birth)))::integer
    end as age,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status,
    p.verification_status
  from public.profiles p
  join public.profile_photos ph
    on ph.profile_id = p.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where p.account_type = 'au_pair'
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.created_at,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    p.birth_date,
    p.date_of_birth,
    p.bio,
    p.last_active_at,
    p.verification_status,
    primary_photo.storage_path
  order by p.created_at desc;
$$;

create function public.get_family_search_cards()
returns table (
  id uuid,
  public_slug text,
  created_at timestamptz,
  full_name text,
  country text,
  city text,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text,
  verification_status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.public_slug,
    p.created_at,
    p.full_name,
    p.country,
    p.city,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.accommodation_info,
    p.expectations,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status,
    p.verification_status
  from public.profiles p
  left join public.profile_photos ph
    on ph.profile_id = p.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where p.account_type = 'family'
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.created_at,
    p.full_name,
    p.country,
    p.city,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.accommodation_info,
    p.expectations,
    p.bio,
    p.last_active_at,
    p.verification_status,
    primary_photo.storage_path
  order by p.created_at desc;
$$;

create function public.get_public_profile(p_profile_id uuid)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  country text,
  city text,
  nationality text,
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  smoking_status text,
  gender text,
  age integer,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text,
  verification_status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.public_slug,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    case
      when coalesce(p.birth_date, p.date_of_birth) is null then null
      else date_part('year', age(current_date, coalesce(p.birth_date, p.date_of_birth)))::integer
    end as age,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
    p.accommodation_info,
    p.expectations,
    p.bio,
    primary_photo.storage_path as primary_photo_path,
    count(ph.id) as photo_count,
    public.profile_activity_status(p.last_active_at) as activity_status,
    p.verification_status
  from public.profiles p
  left join public.profile_photos ph
    on ph.profile_id = p.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where p.id = p_profile_id
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  group by
    p.id,
    p.public_slug,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    p.nationality,
    p.mother_tongue,
    p.fluent_languages,
    p.basic_languages,
    p.availability_start,
    p.availability_start_from,
    p.availability_start_to,
    p.duration,
    p.duration_min_months,
    p.duration_max_months,
    p.smoking_status,
    p.gender,
    p.birth_date,
    p.date_of_birth,
    p.children_info,
    p.au_pair_allowance_amount,
    p.au_pair_allowance_currency,
    p.accommodation_info,
    p.expectations,
    p.bio,
    p.last_active_at,
    p.verification_status,
    primary_photo.storage_path
  limit 1;
$$;

create function public.get_public_profile_by_identifier(p_identifier text)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  country text,
  city text,
  nationality text,
  mother_tongue text,
  fluent_languages text[],
  basic_languages text[],
  availability_start text,
  availability_start_from date,
  availability_start_to date,
  duration text,
  duration_min_months integer,
  duration_max_months integer,
  smoking_status text,
  gender text,
  age integer,
  children_info text,
  au_pair_allowance_amount integer,
  au_pair_allowance_currency text,
  accommodation_info text,
  expectations text,
  bio text,
  primary_photo_path text,
  photo_count bigint,
  activity_status text,
  verification_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id
    into v_profile_id
    from public.profiles p
    where p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
      and (p.public_slug = p_identifier or p.id = p_identifier::uuid)
    limit 1;
  else
    select p.id
    into v_profile_id
    from public.profiles p
    where p.onboarding_completed = true
      and p.suspended_at is null
      and p.deletion_requested_at is null
      and coalesce(p.is_admin, false) = false
      and p.public_slug = p_identifier
    limit 1;
  end if;

  return query
  select *
  from public.get_public_profile(v_profile_id);
end;
$$;

grant execute on function public.get_au_pair_search_cards() to anon, authenticated;
grant execute on function public.get_family_search_cards() to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.get_public_profile_by_identifier(text) to anon, authenticated;

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
  last_message_body text,
  last_message_image_path text,
  last_message_image_mime_type text,
  last_message_created_at timestamptz,
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
      coalesce(c.last_message_at, c.updated_at, c.created_at) as activity_at,
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
    last_message.body as last_message_body,
    last_message.image_path as last_message_image_path,
    last_message.image_mime_type as last_message_image_mime_type,
    last_message.created_at as last_message_created_at,
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
    ) as unread_count
  from viewer_conversations vc
  join public.profiles p
    on p.id = case
      when vc.family_id = auth.uid() then vc.au_pair_id
      else vc.family_id
    end
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  left join lateral (
    select body, image_path, image_mime_type, created_at
    from public.messages
    where conversation_id = vc.id
    order by created_at desc
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

drop function if exists public.get_message_profile_suggestions(text, integer);

create or replace function public.get_message_profile_suggestions(
  p_query text default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  public_slug text,
  account_type text,
  full_name text,
  country text,
  city text,
  primary_photo_path text,
  activity_status text,
  verification_status text
)
language sql
security definer
stable
set search_path = public
as $$
  with viewer as (
    select id, account_type
    from public.profiles
    where id = auth.uid()
      and onboarding_completed = true
      and suspended_at is null
      and deletion_requested_at is null
      and coalesce(is_admin, false) = false
    limit 1
  ),
  normalized as (
    select nullif(trim(coalesce(p_query, '')), '') as query
  )
  select
    p.id,
    p.public_slug,
    p.account_type,
    p.full_name,
    p.country,
    p.city,
    primary_photo.storage_path as primary_photo_path,
    public.profile_activity_status(p.last_active_at) as activity_status,
    p.verification_status
  from public.profiles p
  join viewer v
    on p.account_type = case
      when v.account_type = 'family' then 'au_pair'
      when v.account_type = 'au_pair' then 'family'
      else null
    end
  cross join normalized n
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where auth.uid() is not null
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
    and not public.profile_pair_blocked(v.id, p.id)
    and (
      n.query is null
      or concat_ws(' ', p.full_name, p.city, p.country) ilike '%' || n.query || '%'
    )
  order by
    case public.profile_activity_status(p.last_active_at)
      when 'active' then 0
      when 'recently_active' then 1
      else 2
    end,
    p.last_active_at desc nulls last,
    p.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 24);
$$;

grant execute on function public.get_message_profile_suggestions(text, integer) to authenticated;
