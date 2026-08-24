update storage.buckets
set file_size_limit = 10 * 1024 * 1024
where id = 'profile-stories';
