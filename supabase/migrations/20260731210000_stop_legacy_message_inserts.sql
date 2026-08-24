-- Message creation now goes exclusively through send_message_if_allowed(),
-- which performs the final eligibility check and idempotent insert atomically.
-- Remove the legacy direct-table write path so stale browser bundles and
-- automated clients are rejected before running message INSERT policies and
-- triggers.
revoke insert on table public.messages from public, anon, authenticated;
