create or replace function public.get_message_inbox_cards()
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
