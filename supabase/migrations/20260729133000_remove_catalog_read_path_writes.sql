-- Keep public catalog reads read-only. The previous exposure upsert serialized
-- concurrent readers on the same featured profiles and added a write round-trip
-- to every catalog request.
--
-- Also split the conversation engagement count by participant type. This keeps
-- the result identical while allowing Postgres to use the existing
-- (family_id, created_at) and (au_pair_id, created_at) indexes without an OR.
do $migration$
declare
  v_definition text;
  v_updated_definition text;
  v_write_start integer;
  v_return_start integer;
  v_old_conversation_count constant text := $old$
          (
            select count(*)::bigint
            from public.conversations conversation
            where v_sort = 'recommended'
              and conversation.created_at >= v_now - interval '30 days'
              and (
                (profile.account_type = 'family' and conversation.family_id = profile.id)
                or (
                  profile.account_type = 'au_pair'
                  and conversation.au_pair_id = profile.id
                )
              )
          ) as conversation_count
$old$;
  v_new_conversation_count constant text := $new$
          case
            when v_sort <> 'recommended' then 0::bigint
            when profile.account_type = 'family' then (
              select count(*)::bigint
              from public.conversations conversation
              where conversation.family_id = profile.id
                and conversation.created_at >= v_now - interval '30 days'
            )
            when profile.account_type = 'au_pair' then (
              select count(*)::bigint
              from public.conversations conversation
              where conversation.au_pair_id = profile.id
                and conversation.created_at >= v_now - interval '30 days'
            )
            else 0::bigint
          end as conversation_count
$new$;
begin
  select pg_get_functiondef(
    'public.get_bounded_public_profile_cards(text,jsonb,uuid,text,integer,integer,integer,boolean)'::regprocedure
  )
  into v_definition;

  if strpos(v_definition, v_old_conversation_count) = 0 then
    raise exception 'Could not find the bounded catalog conversation count';
  end if;

  v_updated_definition := replace(
    v_definition,
    v_old_conversation_count,
    v_new_conversation_count
  );

  if strpos(v_updated_definition, v_old_conversation_count) > 0 then
    raise exception 'Could not replace the bounded catalog conversation count';
  end if;

  v_write_start := strpos(
    v_updated_definition,
    'insert into public.profile_catalog_exposures ('
  );
  v_return_start := strpos(v_updated_definition, 'return v_result;');

  if v_write_start = 0
    or v_return_start = 0
    or v_return_start <= v_write_start
  then
    raise exception 'Could not isolate the bounded catalog exposure write';
  end if;

  v_updated_definition := left(v_updated_definition, v_write_start - 1)
    || substr(v_updated_definition, v_return_start);

  if strpos(
    v_updated_definition,
    'insert into public.profile_catalog_exposures ('
  ) > 0 then
    raise exception 'The bounded catalog exposure write was not removed';
  end if;

  execute v_updated_definition;
end;
$migration$;

-- CREATE OR REPLACE preserves the existing ACL, but reassert the service-only
-- contract explicitly so a future baseline change cannot broaden execution.
revoke all on function public.get_bounded_public_profile_cards(
  text,
  jsonb,
  uuid,
  text,
  integer,
  integer,
  integer,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.get_bounded_public_profile_cards(
  text,
  jsonb,
  uuid,
  text,
  integer,
  integer,
  integer,
  boolean
) to service_role;
