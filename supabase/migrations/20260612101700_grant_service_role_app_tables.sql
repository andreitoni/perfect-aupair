grant usage on schema public to service_role;

grant select, insert, update, delete
on table public.profiles
to service_role;

grant select, insert, update, delete
on table public.profile_photos
to service_role;

grant select, insert, update, delete
on table public.profile_stories
to service_role;

grant select, insert, update, delete
on table public.conversations
to service_role;

grant select, insert, update, delete
on table public.messages
to service_role;

grant select, insert, update, delete
on table public.profile_favorites
to service_role;

grant select, insert, update, delete
on table public.conversation_reads
to service_role;

grant select, insert, update, delete
on table public.moderation_reports
to service_role;
