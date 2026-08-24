alter table public.profiles
add column if not exists notification_emails_enabled boolean,
add column if not exists marketing_emails_enabled boolean;

update public.profiles
set notification_emails_enabled = true
where notification_emails_enabled is null;

update public.profiles
set marketing_emails_enabled = false
where marketing_emails_enabled is null;

alter table public.profiles
alter column notification_emails_enabled set default true,
alter column notification_emails_enabled set not null,
alter column marketing_emails_enabled set default false,
alter column marketing_emails_enabled set not null;

comment on column public.profiles.notification_emails_enabled is
  'Whether the user wants transactional notification emails for new messages and profile favorites.';

comment on column public.profiles.marketing_emails_enabled is
  'Whether the user opted in to news, events, and promotional emails.';
