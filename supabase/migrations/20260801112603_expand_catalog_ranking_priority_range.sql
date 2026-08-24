-- Values 1-1000 remain manual boosts. Organic profiles use the effective
-- priority 1001 inside the catalog RPC. Values above 1001 are explicit
-- operator-requested de-prioritizations and therefore sort after organic rows.
alter table public.profile_catalog_ranking_overrides
drop constraint profile_catalog_ranking_overrides_priority_check;

alter table public.profile_catalog_ranking_overrides
add constraint profile_catalog_ranking_overrides_priority_check
check (priority between 1 and 2000);
