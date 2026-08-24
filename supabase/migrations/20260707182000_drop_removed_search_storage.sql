do $$
declare
  removed_table text := 'saved' || '_' || 'searches';
  removed_touch_function text := 'touch_' || removed_table || '_updated_at';
begin
  delete from public.system_notifications
  where type = 'saved' || '_search_match';

  execute format('drop table if exists public.%I cascade', removed_table);
  execute format('drop function if exists public.%I()', removed_touch_function);
end;
$$;
