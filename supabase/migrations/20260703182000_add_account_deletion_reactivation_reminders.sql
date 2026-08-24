alter table public.account_deletion_requests
add column if not exists reminder_sent_at timestamptz;

alter table public.account_deletion_requests
alter column scheduled_delete_at set default (now() + interval '7 days');

update public.account_deletion_requests
set scheduled_delete_at = least(scheduled_delete_at, requested_at + interval '7 days')
where status = 'pending';

with latest_pending_deletion as (
  select distinct on (profile_id)
    profile_id,
    scheduled_delete_at
  from public.account_deletion_requests
  where status = 'pending'
  order by profile_id, requested_at desc, created_at desc
)
update public.profiles p
set deletion_scheduled_at = latest_pending_deletion.scheduled_delete_at
from latest_pending_deletion
where p.id = latest_pending_deletion.profile_id
  and p.deletion_requested_at is not null;

create index if not exists account_deletion_requests_reminder_idx
on public.account_deletion_requests(scheduled_delete_at)
where status = 'pending'
  and reminder_sent_at is null;
