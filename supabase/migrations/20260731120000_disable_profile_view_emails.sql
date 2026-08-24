-- Profile views remain available as in-app activity, but no longer send email.
update public.feature_flags
set description = 'Allow bounded first-message and profile-favorite notification emails.'
where key = 'engagement_emails';
