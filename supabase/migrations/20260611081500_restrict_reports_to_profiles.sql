alter table public.moderation_reports
drop constraint if exists moderation_reports_subject_type_check;

alter table public.moderation_reports
add constraint moderation_reports_subject_type_check
check (subject_type = 'profile');

alter table public.moderation_reports
drop constraint if exists moderation_reports_no_self_profile_report;

alter table public.moderation_reports
add constraint moderation_reports_no_self_profile_report
check (
  reporter_id is null
  or reported_profile_id is null
  or reporter_id <> reported_profile_id
);

drop policy if exists "Users can create their own moderation reports"
on public.moderation_reports;

create policy "Users can create their own moderation reports"
on public.moderation_reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and subject_type = 'profile'
  and reporter_id <> reported_profile_id
);
