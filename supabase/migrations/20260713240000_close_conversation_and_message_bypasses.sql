-- Prevent authenticated clients from rewriting private conversation ownership,
-- and keep sender media deletion atomic with the mandatory retention ledger.

drop policy if exists "Conversation participants can update conversations"
on public.conversations;
drop policy if exists "Users can create their own conversations"
on public.conversations;
revoke insert, update, delete on public.conversations from authenticated;

create or replace function public.message_send_is_allowed(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    p_sender_id is not null
    and p_sender_id = (select auth.uid())
    and public.database_feature_flag_enabled('message_send')
    and exists (
      select 1
      from public.conversations conversation
      join public.profiles family_profile
        on family_profile.id = conversation.family_id
      join public.profiles au_pair_profile
        on au_pair_profile.id = conversation.au_pair_id
      where conversation.id = p_conversation_id
        and p_sender_id in (conversation.family_id, conversation.au_pair_id)
        and not public.profile_pair_blocked(
          conversation.family_id,
          conversation.au_pair_id
        )
        and family_profile.account_type = 'family'
        and au_pair_profile.account_type = 'au_pair'
        and family_profile.onboarding_completed = true
        and au_pair_profile.onboarding_completed = true
        and family_profile.content_moderation_status = 'approved'
        and au_pair_profile.content_moderation_status = 'approved'
        and family_profile.suspended_at is null
        and au_pair_profile.suspended_at is null
        and family_profile.deletion_requested_at is null
        and au_pair_profile.deletion_requested_at is null
        and family_profile.deletion_scheduled_at is null
        and au_pair_profile.deletion_scheduled_at is null
        and coalesce(family_profile.is_admin, false) = false
        and coalesce(au_pair_profile.is_admin, false) = false
        and exists (
          select 1 from public.profile_photos family_photo
          where family_photo.profile_id = family_profile.id
        )
        and exists (
          select 1 from public.profile_photos au_pair_photo
          where au_pair_photo.profile_id = au_pair_profile.id
        )
    );
$$;

revoke all on function public.message_send_is_allowed(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.message_send_is_allowed(uuid, uuid)
to authenticated, service_role;

drop policy if exists "Conversation participants can upload message photo files"
on storage.objects;
create policy "Conversation participants can upload message photo files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-photos'
  and public.message_send_is_allowed(
    ((storage.foldername(name))[1])::uuid,
    (select auth.uid())
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Conversation participants can upload message video files"
on storage.objects;
create policy "Conversation participants can upload message video files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-videos'
  and public.message_send_is_allowed(
    ((storage.foldername(name))[1])::uuid,
    (select auth.uid())
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

drop policy if exists "Conversation participants can upload message audio files"
on storage.objects;
create policy "Conversation participants can upload message audio files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-audio'
  and public.message_send_is_allowed(
    ((storage.foldername(name))[1])::uuid,
    (select auth.uid())
  )
  and public.reserve_storage_upload_quota(
    bucket_id,
    name,
    public.storage_object_size_bytes(metadata)
  )
);

create or replace function public.delete_own_message_media(
  p_message_id uuid,
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_message public.messages%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null
    or p_message_id is null
    or p_conversation_id is null
  then
    return false;
  end if;

  select message.*
  into v_message
  from public.messages message
  where message.id = p_message_id
    and message.conversation_id = p_conversation_id
  for update;

  if not found
    or v_message.sender_id <> v_user_id
    or (
      v_message.image_path is null
      and v_message.video_path is null
      and v_message.audio_path is null
    )
  then
    return false;
  end if;

  if v_message.image_path is not null then
    insert into public.retained_message_photos (
      message_id,
      conversation_id,
      sender_id,
      original_image_path,
      image_mime_type,
      retained_until
    ) values (
      v_message.id,
      v_message.conversation_id,
      v_message.sender_id,
      v_message.image_path,
      v_message.image_mime_type,
      v_now + interval '90 days'
    )
    on conflict (original_image_path) do update
    set retained_until = greatest(
      public.retained_message_photos.retained_until,
      excluded.retained_until
    );
  end if;

  if v_message.video_path is not null then
    insert into public.retained_message_videos (
      message_id,
      conversation_id,
      sender_id,
      original_video_path,
      video_mime_type,
      video_size_bytes,
      video_duration_seconds,
      retained_until
    ) values (
      v_message.id,
      v_message.conversation_id,
      v_message.sender_id,
      v_message.video_path,
      v_message.video_mime_type,
      v_message.video_size_bytes,
      v_message.video_duration_seconds,
      v_now + interval '3 days'
    )
    on conflict (original_video_path) do update
    set retained_until = greatest(
      public.retained_message_videos.retained_until,
      excluded.retained_until
    );
  end if;

  if v_message.audio_path is not null then
    insert into public.retained_message_audio (
      message_id,
      conversation_id,
      sender_id,
      original_audio_path,
      audio_mime_type,
      audio_size_bytes,
      audio_duration_seconds,
      retained_until
    ) values (
      v_message.id,
      v_message.conversation_id,
      v_message.sender_id,
      v_message.audio_path,
      v_message.audio_mime_type,
      v_message.audio_size_bytes,
      v_message.audio_duration_seconds,
      v_now + interval '3 days'
    )
    on conflict (original_audio_path) do update
    set retained_until = greatest(
      public.retained_message_audio.retained_until,
      excluded.retained_until
    );
  end if;

  if nullif(pg_catalog.btrim(coalesce(v_message.body, '')), '') is not null then
    update public.messages
    set
      image_path = null,
      image_mime_type = null,
      video_path = null,
      video_mime_type = null,
      video_size_bytes = null,
      video_duration_seconds = null,
      audio_path = null,
      audio_mime_type = null,
      audio_size_bytes = null,
      audio_duration_seconds = null
    where id = v_message.id;
  else
    delete from public.messages where id = v_message.id;
  end if;

  return true;
end;
$$;

revoke all on function public.delete_own_message_media(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.delete_own_message_media(uuid, uuid)
to authenticated;
