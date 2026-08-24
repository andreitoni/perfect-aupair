create table if not exists public.account_login_ip_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  ip_address inet not null,
  auth_method text not null default 'password'
    check (auth_method in ('password', 'google')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  login_count bigint not null default 1 check (login_count > 0),
  unique (profile_id, ip_address, auth_method)
);

alter table public.account_login_ip_history enable row level security;

create index if not exists account_login_ip_history_last_seen_idx
on public.account_login_ip_history (last_seen_at desc);

create index if not exists account_login_ip_history_profile_last_seen_idx
on public.account_login_ip_history (profile_id, last_seen_at desc);

revoke all on table public.account_login_ip_history from public, anon, authenticated;
grant select, insert, update, delete on table public.account_login_ip_history to service_role;

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

  if p_auth_method not in ('password', 'google') then
    raise exception 'Unsupported authentication method';
  end if;

  insert into public.account_login_ip_history (
    profile_id,
    ip_address,
    auth_method
  )
  values (
    p_profile_id,
    p_ip_address,
    p_auth_method
  )
  on conflict (profile_id, ip_address, auth_method)
  do update set
    last_seen_at = now(),
    login_count = account_login_ip_history.login_count + 1;
end;
$$;

revoke all on function public.record_account_login_ip(uuid, inet, text)
from public, anon, authenticated;
grant execute on function public.record_account_login_ip(uuid, inet, text)
to service_role;
