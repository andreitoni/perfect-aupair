create or replace function public.get_message_conversation_profile(
  p_conversation_id uuid
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
set search_path = public
as $$
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
  from public.conversations c
  join public.profiles p
    on p.id = case
      when c.family_id = auth.uid() then c.au_pair_id
      else c.family_id
    end
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  where auth.uid() is not null
    and c.id = p_conversation_id
    and (
      c.family_id = auth.uid()
      or c.au_pair_id = auth.uid()
    )
    and p.onboarding_completed = true
    and p.public_slug is not null
    and p.suspended_at is null
    and p.deletion_requested_at is null
    and coalesce(p.is_admin, false) = false
  limit 1;
$$;

grant execute on function public.get_message_conversation_profile(uuid) to authenticated;

create or replace function public.get_unread_message_count_for_conversation(
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 0;
  end if;

  if not public.is_conversation_member(p_conversation_id, v_user_id) then
    return 0;
  end if;

  select count(*)::integer
  into v_count
  from public.messages m
  left join public.conversation_reads r
    on r.user_id = v_user_id
   and r.conversation_id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and m.sender_id <> v_user_id
    and m.created_at > coalesce(r.last_read_at, '1970-01-01'::timestamptz)
    and m.created_at > coalesce(r.hidden_at, '1970-01-01'::timestamptz);

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.get_unread_message_count_for_conversation(uuid) to authenticated;

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
  last_message_video_path text,
  last_message_video_mime_type text,
  last_message_audio_path text,
  last_message_audio_mime_type text,
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
    last_message.body as last_message_body,
    last_message.image_path as last_message_image_path,
    last_message.image_mime_type as last_message_image_mime_type,
    last_message.video_path as last_message_video_path,
    last_message.video_mime_type as last_message_video_mime_type,
    last_message.audio_path as last_message_audio_path,
    last_message.audio_mime_type as last_message_audio_mime_type,
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
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = p.id
    order by is_primary desc, sort_order asc, created_at asc
    limit 1
  ) primary_photo on true
  left join lateral (
    select
      body,
      image_path,
      image_mime_type,
      video_path,
      video_mime_type,
      audio_path,
      audio_mime_type,
      created_at
    from public.messages
    where conversation_id = vc.id
      and (
        vc.hidden_at is null
        or created_at > vc.hidden_at
      )
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
