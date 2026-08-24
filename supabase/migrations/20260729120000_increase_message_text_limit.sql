alter table public.messages
drop constraint if exists messages_content_check;

alter table public.messages
add constraint messages_content_check
check (
  char_length(body) <= 4000
  and (
    char_length(body) >= 1
    or image_path is not null
    or video_path is not null
    or audio_path is not null
  )
) not valid;

alter table public.messages
validate constraint messages_content_check;
