grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
on table public.profiles
to authenticated;

grant select
on table public.profile_photos
to anon, authenticated;

grant insert, update, delete
on table public.profile_photos
to authenticated;

grant select
on table public.profile_stories
to anon, authenticated;

grant insert, update, delete
on table public.profile_stories
to authenticated;

grant select, insert, update, delete
on table public.conversations
to authenticated;

grant select, insert, update, delete
on table public.messages
to authenticated;

grant select, insert, update, delete
on table public.profile_favorites
to authenticated;

grant select, insert, update, delete
on table public.conversation_reads
to authenticated;

grant select, insert
on table public.moderation_reports
to authenticated;
