delete from public.profile_stories ps
where not exists (
  select 1
  from storage.objects so
  where so.bucket_id = 'profile-stories'
    and so.name = ps.storage_path
);
