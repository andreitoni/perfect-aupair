create or replace function public.reserve_ai_moderation_budget(
  p_model text,
  p_input_count integer,
  p_daily_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_recent_attempts integer;
begin
  if p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 10000 then
    raise exception 'AI moderation daily limit is invalid';
  end if;

  if p_input_count is null or p_input_count < 1 or p_input_count > 100 then
    raise exception 'AI moderation input count is invalid';
  end if;

  if p_model is null or char_length(trim(p_model)) < 1 or char_length(p_model) > 120 then
    raise exception 'AI moderation model is invalid';
  end if;

  -- Serialize all reservations so a concurrent burst cannot overrun the cap.
  perform pg_advisory_xact_lock(
    hashtextextended('perfect-aupair:ai-moderation-daily-budget', 0)
  );

  select coalesce(sum(input_count), 0)::integer
  into v_recent_attempts
  from public.ai_moderation_usage_events
  where status = 'attempted'
    and created_at > v_now - interval '24 hours';

  if v_recent_attempts + p_input_count > p_daily_limit then
    -- Do not create one row per rejected retry; the safety control must remain
    -- bounded even while an upstream caller is malfunctioning or under attack.
    return false;
  end if;

  insert into public.ai_moderation_usage_events (
    model,
    input_count,
    status
  )
  values (
    p_model,
    p_input_count,
    'attempted'
  );

  return true;
end;
$$;

revoke all on function public.reserve_ai_moderation_budget(text, integer, integer)
from public, anon, authenticated;

grant execute on function public.reserve_ai_moderation_budget(text, integer, integer)
to service_role;
