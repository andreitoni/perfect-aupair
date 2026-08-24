-- Quiet hours must follow the recipient's local market rather than UTC.
-- Country is the only location signal collected by profiles today, so use a
-- representative IANA zone for countries already present on the platform and
-- the main markets likely to register next.

create or replace function public.message_notification_timezone(p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.lower(pg_catalog.btrim(coalesce(p_country, '')))
    when 'algeria' then 'Africa/Algiers'
    when 'angola' then 'Africa/Luanda'
    when 'american samoa' then 'Pacific/Pago_Pago'
    when 'australia' then 'Australia/Sydney'
    when 'austria' then 'Europe/Vienna'
    when 'bangladesh' then 'Asia/Dhaka'
    when 'belgium' then 'Europe/Brussels'
    when 'brazil' then 'America/Sao_Paulo'
    when 'cameroon' then 'Africa/Douala'
    when 'canada' then 'America/Toronto'
    when 'china' then 'Asia/Shanghai'
    when 'czechia' then 'Europe/Prague'
    when 'czech republic' then 'Europe/Prague'
    when 'denmark' then 'Europe/Copenhagen'
    when 'egypt' then 'Africa/Cairo'
    when 'ethiopia' then 'Africa/Addis_Ababa'
    when 'finland' then 'Europe/Helsinki'
    when 'france' then 'Europe/Paris'
    when 'gambia' then 'Africa/Banjul'
    when 'germany' then 'Europe/Berlin'
    when 'ghana' then 'Africa/Accra'
    when 'greece' then 'Europe/Athens'
    when 'india' then 'Asia/Kolkata'
    when 'indonesia' then 'Asia/Jakarta'
    when 'ireland' then 'Europe/Dublin'
    when 'italy' then 'Europe/Rome'
    when 'japan' then 'Asia/Tokyo'
    when 'kenya' then 'Africa/Nairobi'
    when 'madagascar' then 'Indian/Antananarivo'
    when 'malaysia' then 'Asia/Kuala_Lumpur'
    when 'mexico' then 'America/Mexico_City'
    when 'morocco' then 'Africa/Casablanca'
    when 'nepal' then 'Asia/Kathmandu'
    when 'netherlands' then 'Europe/Amsterdam'
    when 'new zealand' then 'Pacific/Auckland'
    when 'nigeria' then 'Africa/Lagos'
    when 'norway' then 'Europe/Oslo'
    when 'pakistan' then 'Asia/Karachi'
    when 'philippines' then 'Asia/Manila'
    when 'poland' then 'Europe/Warsaw'
    when 'portugal' then 'Europe/Lisbon'
    when 'romania' then 'Europe/Bucharest'
    when 'rwanda' then 'Africa/Kigali'
    when 'senegal' then 'Africa/Dakar'
    when 'singapore' then 'Asia/Singapore'
    when 'south africa' then 'Africa/Johannesburg'
    when 'south korea' then 'Asia/Seoul'
    when 'spain' then 'Europe/Madrid'
    when 'sri lanka' then 'Asia/Colombo'
    when 'sweden' then 'Europe/Stockholm'
    when 'switzerland' then 'Europe/Zurich'
    when 'tanzania' then 'Africa/Dar_es_Salaam'
    when 'thailand' then 'Asia/Bangkok'
    when 'tunisia' then 'Africa/Tunis'
    when 'turkey' then 'Europe/Istanbul'
    when 'uganda' then 'Africa/Kampala'
    when 'ukraine' then 'Europe/Kyiv'
    when 'united kingdom' then 'Europe/London'
    when 'united states' then 'America/New_York'
    when 'united states of america' then 'America/New_York'
    when 'vietnam' then 'Asia/Ho_Chi_Minh'
    when 'zimbabwe' then 'Africa/Harare'
    when 'as' then 'Pacific/Pago_Pago'
    when 'at' then 'Europe/Vienna'
    when 'au' then 'Australia/Sydney'
    when 'bd' then 'Asia/Dhaka'
    when 'br' then 'America/Sao_Paulo'
    when 'ca' then 'America/Toronto'
    when 'de' then 'Europe/Berlin'
    when 'dk' then 'Europe/Copenhagen'
    when 'gb' then 'Europe/London'
    when 'id' then 'Asia/Jakarta'
    when 'in' then 'Asia/Kolkata'
    when 'ke' then 'Africa/Nairobi'
    when 'mg' then 'Indian/Antananarivo'
    when 'ph' then 'Asia/Manila'
    when 'se' then 'Europe/Stockholm'
    when 'us' then 'America/New_York'
    else 'UTC'
  end
$$;

revoke all on function public.message_notification_timezone(text)
from public, anon, authenticated;

-- Correct pending rows created while these countries still fell back to UTC.
update public.message_digest_email_deliveries delivery
set
  time_zone = public.message_notification_timezone(profile.country),
  due_at = (delivery.digest_date::timestamp + time '08:00')
    at time zone public.message_notification_timezone(profile.country),
  updated_at = pg_catalog.clock_timestamp()
from public.profiles profile
where profile.id = delivery.recipient_id
  and delivery.sent_at is null
  and delivery.suppressed_at is null
  and delivery.time_zone is distinct from
    public.message_notification_timezone(profile.country);
