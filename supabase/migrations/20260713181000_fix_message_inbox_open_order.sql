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
  on conflict (family_id, au_pair_id) do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id
    into v_conversation_id
    from public.conversations
    where family_id = v_family_id
      and au_pair_id = v_au_pair_id;
  end if;

  if v_conversation_id is null then
    raise exception 'Could not create conversation';
  end if;

  return v_conversation_id;
end;
$$;

grant execute on function public.create_or_get_conversation(uuid) to authenticated;

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
  last_message_order_key bigint,
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
      conversation.id,
      conversation.family_id,
      conversation.au_pair_id,
      conversation.created_at,
      conversation.updated_at,
      conversation.last_message_at,
      coalesce(
        conversation.last_message_at,
        conversation.created_at
      ) as visibility_at,
      conversation_read.hidden_at
    from public.conversations conversation
    left join public.conversation_reads conversation_read
      on conversation_read.user_id = auth.uid()
     and conversation_read.conversation_id = conversation.id
    where auth.uid() is not null
      and (
        conversation.family_id = auth.uid()
        or conversation.au_pair_id = auth.uid()
      )
  )
  select
    viewer_conversation.id as conversation_id,
    viewer_conversation.family_id,
    viewer_conversation.au_pair_id,
    viewer_conversation.created_at,
    viewer_conversation.updated_at,
    viewer_conversation.last_message_at,
    coalesce(
      last_message.sent_at,
      viewer_conversation.created_at
    ) as activity_at,
    profile.id as other_profile_id,
    profile.account_type as other_account_type,
    profile.public_slug as other_public_slug,
    profile.full_name as other_full_name,
    profile.country as other_country,
    profile.city as other_city,
    primary_photo.storage_path as other_primary_photo_path,
    public.profile_activity_status(profile.last_active_at) as other_activity_status,
    profile.verification_status as other_verification_status,
    last_message.id as last_message_id,
    last_message.order_key as last_message_order_key,
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
      where unread_message.conversation_id = viewer_conversation.id
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
  from viewer_conversations viewer_conversation
  join public.profiles profile
    on profile.id = case
      when viewer_conversation.family_id = auth.uid()
        then viewer_conversation.au_pair_id
      else viewer_conversation.family_id
    end
  left join public.conversation_reads other_read
    on other_read.user_id = profile.id
   and other_read.conversation_id = viewer_conversation.id
  left join lateral (
    select storage_path
    from public.profile_photos
    where profile_id = profile.id
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
    where conversation_id = viewer_conversation.id
      and (
        viewer_conversation.hidden_at is null
        or created_at > viewer_conversation.hidden_at
      )
    order by order_key desc
    limit 1
  ) last_message on true
  where (
      viewer_conversation.hidden_at is null
      or viewer_conversation.visibility_at > viewer_conversation.hidden_at
    )
    and profile.onboarding_completed = true
    and profile.public_slug is not null
    and profile.suspended_at is null
    and profile.deletion_requested_at is null
    and coalesce(profile.is_admin, false) = false
  order by
    last_message.order_key desc nulls last,
    viewer_conversation.created_at desc;
$$;

grant execute on function public.get_message_inbox_cards() to authenticated;
