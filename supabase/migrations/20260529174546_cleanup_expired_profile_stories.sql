delete from public.profile_stories
where expires_at <= now();
