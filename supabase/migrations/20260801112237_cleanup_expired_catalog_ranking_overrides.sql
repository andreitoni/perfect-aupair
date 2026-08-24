-- Remove ranking overrides that have reached their configured expiry.
delete from public.profile_catalog_ranking_overrides
where expires_at <= now();
