with ranked_pending_requests as (
  select
    id,
    row_number() over (
      partition by profile_id
      order by created_at desc, id desc
    ) as pending_rank
  from public.profile_verification_requests
  where status = 'pending'
)
update public.profile_verification_requests request
set
  status = 'rejected',
  reviewer_note = case
    when nullif(trim(request.reviewer_note), '') is null
      then 'Superseded by a newer pending verification request.'
    else request.reviewer_note
  end,
  reviewed_at = coalesce(request.reviewed_at, now())
from ranked_pending_requests ranked
where request.id = ranked.id
  and ranked.pending_rank > 1;

update public.profiles profile
set
  verification_status = 'pending',
  verification_requested_at = coalesce(
    profile.verification_requested_at,
    pending_request.created_at
  ),
  verification_rejected_reason = null
from (
  select profile_id, max(created_at) as created_at
  from public.profile_verification_requests
  where status = 'pending'
  group by profile_id
) pending_request
where profile.id = pending_request.profile_id
  and profile.verification_status <> 'verified';

create unique index if not exists profile_verification_requests_one_pending_per_profile_idx
on public.profile_verification_requests (profile_id)
where status = 'pending';
