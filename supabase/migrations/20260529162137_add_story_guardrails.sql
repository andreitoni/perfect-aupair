do $$
declare
  v_table regclass;
  v_schema text;
  v_name text;
  v_table_sql text;
  v_has_profile_id boolean;
  v_has_created_at boolean;
begin
  v_table := coalesce(
    to_regclass('public.stories'),
    to_regclass('public.profile_stories'),
    to_regclass('public.user_stories')
  );

  if v_table is null then
    raise notice 'No stories table found. Skipping story guardrails.';
    return;
  end if;

  select n.nspname, c.relname
  into v_schema, v_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.oid = v_table;

  v_table_sql := format('%I.%I', v_schema, v_name);

  select exists (
    select 1
    from information_schema.columns
    where table_schema = v_schema
      and table_name = v_name
      and column_name = 'profile_id'
  )
  into v_has_profile_id;

  if not v_has_profile_id then
    raise notice 'Story table % has no profile_id column. Skipping story guardrails.', v_table_sql;
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = v_schema
      and table_name = v_name
      and column_name = 'created_at'
  )
  into v_has_created_at;

  create or replace function public.validate_story_owner()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $function$
  begin
    if new.profile_id is null then
      raise exception 'Story profile_id is required';
    end if;

    if auth.uid() is not null and new.profile_id <> auth.uid() then
      raise exception 'Users can only create stories for their own profile';
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.id = new.profile_id
        and p.onboarding_completed = true
    ) then
      raise exception 'Stories require a completed profile';
    end if;

    return new;
  end;
  $function$;

  execute format('drop trigger if exists validate_story_owner_trigger on %s', v_table_sql);

  execute format(
    'create trigger validate_story_owner_trigger
     before insert or update of profile_id on %s
     for each row
     execute function public.validate_story_owner()',
    v_table_sql
  );

  execute format('alter table %s enable row level security', v_table_sql);

  execute format('drop policy if exists "Anyone can view stories" on %s', v_table_sql);
  execute format('drop policy if exists "Users can create own stories" on %s', v_table_sql);
  execute format('drop policy if exists "Users can update own stories" on %s', v_table_sql);
  execute format('drop policy if exists "Users can delete own stories" on %s', v_table_sql);

  execute format(
    'create policy "Anyone can view stories"
     on %s
     for select
     using (true)',
    v_table_sql
  );

  execute format(
    'create policy "Users can create own stories"
     on %s
     for insert
     with check (auth.uid() = profile_id)',
    v_table_sql
  );

  execute format(
    'create policy "Users can update own stories"
     on %s
     for update
     using (auth.uid() = profile_id)
     with check (auth.uid() = profile_id)',
    v_table_sql
  );

  execute format(
    'create policy "Users can delete own stories"
     on %s
     for delete
     using (auth.uid() = profile_id)',
    v_table_sql
  );

  if v_has_created_at then
    execute format(
      'create index if not exists %I on %s (profile_id, created_at desc)',
      v_name || '_profile_id_created_at_idx',
      v_table_sql
    );
  else
    execute format(
      'create index if not exists %I on %s (profile_id)',
      v_name || '_profile_id_idx',
      v_table_sql
    );
  end if;

  raise notice 'Story guardrails applied to %.%', v_schema, v_name;
end $$;
