delete from public.profile_favorites a
using public.profile_favorites b
where a.user_id = b.user_id
  and a.profile_id = b.profile_id
  and a.created_at > b.created_at;

create unique index if not exists profile_favorites_user_id_profile_id_key
on public.profile_favorites (user_id, profile_id);
