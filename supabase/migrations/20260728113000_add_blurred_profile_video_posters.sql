-- Guests receive only a tiny, pre-blurred first-frame preview. The private
-- profile video remains inaccessible until the viewer is authenticated and
-- eligible.

alter table public.profile_videos
add column if not exists blurred_poster_data_url text;

alter table public.profile_videos
drop constraint if exists profile_videos_blurred_poster_data_url_valid;
alter table public.profile_videos
add constraint profile_videos_blurred_poster_data_url_valid
check (
  blurred_poster_data_url is null
  or (
    pg_catalog.char_length(blurred_poster_data_url) between 100 and 24576
    and blurred_poster_data_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  )
);

create or replace function public.public_profile_approved_video_preview(
  p_profile_id uuid
)
returns table (
  has_video boolean,
  blurred_poster_data_url text
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  with eligible_video as (
    select video.blurred_poster_data_url
    from public.profile_videos video
    where video.profile_id = p_profile_id
      and public.database_feature_flag_enabled('private_media_delivery')
      and video.content_moderation_status = 'approved'
      and public.public_profile_is_eligible(video.profile_id, true)
    limit 1
  )
  select
    exists(select 1 from eligible_video) as has_video,
    (select video.blurred_poster_data_url from eligible_video video limit 1)
      as blurred_poster_data_url;
$$;

revoke all on function public.public_profile_approved_video_preview(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.public_profile_approved_video_preview(uuid)
to anon, authenticated;
