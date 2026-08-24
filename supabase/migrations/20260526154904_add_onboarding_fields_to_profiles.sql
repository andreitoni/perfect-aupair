alter table public.profiles
add column full_name text,
add column country text,
add column city text,
add column nationality text,
add column languages text[] not null default '{}',
add column availability_start text,
add column duration text,
add column bio text,
add column childcare_experience text,
add column children_info text,
add column accommodation_info text,
add column expectations text;

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);