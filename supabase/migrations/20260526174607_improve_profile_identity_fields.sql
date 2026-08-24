alter table public.profiles
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists date_of_birth date,
add column if not exists gender text check (gender in ('female', 'male')),
add column if not exists street_address text,
add column if not exists postal_code text,
add column if not exists phone_country_code text,
add column if not exists phone_number text,
add column if not exists mother_tongue text,
add column if not exists fluent_languages text[] not null default '{}',
add column if not exists basic_languages text[] not null default '{}';