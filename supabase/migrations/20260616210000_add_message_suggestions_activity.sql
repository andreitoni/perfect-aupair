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
    and coalesce(p.is_admin, false) = false
  order by vc.activity_at desc;
$$;

grant execute on function public.get_message_inbox_cards() to authenticated;

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
  activity_status text
)
language sql
security definer
stable
set search_path = public
as $$
  with viewer as (
    select account_type
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
    public.profile_activity_status(p.last_active_at) as activity_status
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
