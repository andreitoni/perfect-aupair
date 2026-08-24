-- The admin_engaged_conversations view is a security-invoker view. Projects
-- with opt-in Data API grants do not automatically grant service_role access
-- to newly created tables, so the view's caller also needs access to this
-- internal source table.
grant select on table public.message_notification_claims to service_role;
