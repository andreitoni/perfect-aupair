alter table public.account_login_ip_history
add column if not exists logged_in_at timestamptz;

update public.account_login_ip_history
set logged_in_at = last_seen_at
where logged_in_at is null;

alter table public.account_login_ip_history
alter column logged_in_at set default now(),
alter column logged_in_at set not null;

alter table public.account_login_ip_history
drop constraint if exists account_login_ip_history_profile_id_ip_address_auth_method_key;

alter table public.account_login_ip_history
drop constraint if exists account_login_ip_history_auth_method_check;

alter table public.account_login_ip_history
add constraint account_login_ip_history_auth_method_check
check (auth_method in ('password', 'google', 'facebook'));

create index if not exists account_login_ip_history_logged_in_at_idx
on public.account_login_ip_history (logged_in_at desc);

create index if not exists account_login_ip_history_profile_logged_in_at_idx
on public.account_login_ip_history (profile_id, logged_in_at desc);

create or replace function public.record_account_login_ip(
  p_profile_id uuid,
  p_ip_address inet,
  p_auth_method text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null or p_ip_address is null then
    return;
  end if;

  if p_auth_method not in ('password', 'google', 'facebook') then
    raise exception 'Unsupported authentication method';
  end if;

  insert into public.account_login_ip_history (
    profile_id,
    ip_address,
    auth_method,
    first_seen_at,
    last_seen_at,
    logged_in_at,
    login_count
  )
  values (
    p_profile_id,
    p_ip_address,
    p_auth_method,
    now(),
    now(),
    now(),
    1
  );
end;
$$;

revoke all on function public.record_account_login_ip(uuid, inet, text)
from public, anon, authenticated;
grant execute on function public.record_account_login_ip(uuid, inet, text)
to service_role;
