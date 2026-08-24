create or replace function public.touch_conversation_media_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = pg_catalog.clock_timestamp()
  where id = new.conversation_id;

  return new;
end;
$$;

revoke all on function public.touch_conversation_media_revision()
from public, anon, authenticated, service_role;

drop trigger if exists touch_conversation_media_revision_trigger
on public.messages;

create trigger touch_conversation_media_revision_trigger
after update of image_path, video_path, audio_path on public.messages
for each row
when (
  old.image_path is distinct from new.image_path
  or old.video_path is distinct from new.video_path
  or old.audio_path is distinct from new.audio_path
)
execute function public.touch_conversation_media_revision();
