grant usage on schema public to authenticated, service_role;

revoke all on table public.profile_blocks from anon, authenticated;
grant select, insert, delete
on table public.profile_blocks
to authenticated;
grant select, insert, update, delete
on table public.profile_blocks
to service_role;

revoke all on table public.profile_verification_requests from anon, authenticated;
grant select, insert
on table public.profile_verification_requests
to authenticated;
grant select, insert, update, delete
on table public.profile_verification_requests
to service_role;

revoke all on table public.account_risk_flags from anon, authenticated;
grant select, insert, update, delete
on table public.account_risk_flags
to service_role;
