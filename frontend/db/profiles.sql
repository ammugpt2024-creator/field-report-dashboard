-- Supabase SQL for profiles table
-- Run this in the Supabase SQL editor or via migration tool.

create table if not exists profiles (
  id uuid primary key,
  email text not null unique,
  full_name text,
  role text not null default 'technician',
  company_name text,
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;

-- Example policy for authenticated users to read their own profile
create policy "Allow users to read own profile"
  on profiles
  for select
  using (auth.uid() = id);

-- Example policy for admins to manage profiles
create policy "Admins can manage profiles"
  on profiles
  for all
  using (exists (
    select 1 from auth.users u where u.id = auth.uid() and u.raw_user_meta_data->>'role' = 'admin'
  ));
