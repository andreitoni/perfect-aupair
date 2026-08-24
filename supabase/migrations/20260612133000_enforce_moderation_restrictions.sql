alter table public.profiles
add column if not exists suspended_until timestamptz,
add column if not exists suspension_rule text;

create index if not exists profiles_suspended_until_idx
on public.profiles (suspended_until)
where suspended_until is not null;

create table if not exists public.banned_auth_emails (
  email text primary key,
  reason text not null default 'Permanent ban for violating platform rules',
  banned_profile_id uuid,
  banned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint banned_auth_emails_lowercase_check check (email = lower(email)),
  constraint banned_auth_emails_reason_length_check check (char_length(reason) between 3 and 240)
);

alter table public.banned_auth_emails enable row level security;

grant select, insert, update, delete on table public.banned_auth_emails to service_role;

create or replace function public.prevent_user_moderation_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  if new.suspended_at is distinct from old.suspended_at
    or new.suspended_until is distinct from old.suspended_until
    or new.suspension_rule is distinct from old.suspension_rule
    or new.suspended_reason is distinct from old.suspended_reason
    or new.suspended_by is distinct from old.suspended_by
  then
    raise exception 'Moderation fields cannot be changed by users.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_user_moderation_field_changes_trigger
on public.profiles;

create trigger prevent_user_moderation_field_changes_trigger
before update on public.profiles
for each row
execute function public.prevent_user_moderation_field_changes();
