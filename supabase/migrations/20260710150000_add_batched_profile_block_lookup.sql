create or replace function public.get_blocked_profile_ids(p_profile_ids uuid[])
returns table (profile_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select distinct candidate.profile_id
  from unnest(
    coalesce(p_profile_ids[1:200], array[]::uuid[])
  ) as candidate(profile_id)
  where (select auth.uid()) is not null
    and candidate.profile_id is not null
    and candidate.profile_id <> (select auth.uid())
    and public.profile_pair_blocked(
      (select auth.uid()),
      candidate.profile_id
    );
$$;

revoke all on function public.get_blocked_profile_ids(uuid[]) from public, anon;
grant execute on function public.get_blocked_profile_ids(uuid[]) to authenticated;
