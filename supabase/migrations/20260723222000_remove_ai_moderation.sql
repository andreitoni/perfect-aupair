-- Public content moderation is manual-only. Remove the retired AI moderation
-- runtime, its budgets, claims, usage history, and operational controls.

update public.profiles
set
  content_moderation_status = 'pending',
  content_moderation_reviewed_at = null,
  content_moderation_reviewed_by = null,
  content_moderation_reason = 'Awaiting manual review.'
where content_moderation_reason ~* (
  'openai|auto-approved by ai|ai moderation|ai provider'
);

update public.profile_stories
set
  content_moderation_status = 'pending',
  content_moderation_reviewed_at = null,
  content_moderation_reviewed_by = null,
  content_moderation_reason = 'Awaiting manual review.'
where content_moderation_reason ~* (
  'openai|auto-approved by ai|ai moderation|ai provider'
);

delete from public.admin_audit_log
where action in (
  'retry_profile_ai_moderation',
  'retry_story_ai_moderation',
  'update_ai_moderation_daily_limit'
);

delete from public.feature_flags
where key in ('ai_moderation', 'ai_moderation_daily_limit');

drop function if exists public.retry_ai_story_moderation_claim(
  uuid,
  text,
  integer
);
drop function if exists public.retry_ai_profile_moderation_claim(
  uuid,
  text,
  integer
);
drop function if exists public.apply_ai_moderation_resource_result(
  uuid,
  text,
  uuid,
  text,
  text
);
drop function if exists public.complete_ai_moderation_resource_claim(uuid);
drop function if exists public.claim_ai_moderation_resource(
  text,
  uuid,
  integer
);
drop function if exists public.reserve_ai_moderation_budget(
  text,
  integer,
  integer
);

drop table if exists public.ai_moderation_resource_claims cascade;
drop function if exists public.enforce_ai_moderation_owner_budget();
drop function if exists public.record_ai_moderation_owner_usage();
drop function if exists public.ai_moderation_resource_version(text, uuid);
drop table if exists public.ai_moderation_owner_usage_events;
drop table if exists public.ai_moderation_usage_events;
