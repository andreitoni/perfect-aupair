alter table public.profiles
add column smoking_status text check (
  smoking_status in ('smoker', 'non_smoker')
);