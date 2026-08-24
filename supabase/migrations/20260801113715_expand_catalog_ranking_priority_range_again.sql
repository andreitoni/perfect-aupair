-- Expand the supported priority range for operational catalog ordering.
alter table public.profile_catalog_ranking_overrides
drop constraint profile_catalog_ranking_overrides_priority_check;

alter table public.profile_catalog_ranking_overrides
add constraint profile_catalog_ranking_overrides_priority_check
check (priority between 1 and 3000);
