alter table public.profiles
add column date_of_birth date,
add column gender text check (gender in ('female', 'male')),
add column street_address text,
add column postal_code text,
add column phone_country_code text,
add column phone_number text,
add column mother_tongue text,
add column fluent_languages text[] not null default '{}',
add column basic_languages text[] not null default '{}';