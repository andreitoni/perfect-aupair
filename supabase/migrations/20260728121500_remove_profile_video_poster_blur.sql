-- Profile video previews remain non-playable for guests, but the saved first
-- frame is now intentionally clear rather than pre-blurred.

alter table public.profile_videos
drop constraint if exists profile_videos_blurred_poster_data_url_valid;

alter table public.profile_videos
rename column blurred_poster_data_url to poster_data_url;

alter table public.profile_videos
add constraint profile_videos_poster_data_url_valid
check (
  poster_data_url is null
  or (
    pg_catalog.char_length(poster_data_url) between 100 and 98304
    and poster_data_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  )
);

drop function if exists public.public_profile_approved_video_preview(uuid);

create function public.public_profile_approved_video_preview(
  p_profile_id uuid
)
returns table (
  has_video boolean,
  poster_data_url text
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
  with eligible_video as (
    select video.poster_data_url
    from public.profile_videos video
    where video.profile_id = p_profile_id
      and public.database_feature_flag_enabled('private_media_delivery')
      and video.content_moderation_status = 'approved'
      and public.public_profile_is_eligible(video.profile_id, true)
    limit 1
  )
  select
    exists(select 1 from eligible_video) as has_video,
    (select video.poster_data_url from eligible_video video limit 1)
      as poster_data_url;
$$;

revoke all on function public.public_profile_approved_video_preview(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.public_profile_approved_video_preview(uuid)
to anon, authenticated;
