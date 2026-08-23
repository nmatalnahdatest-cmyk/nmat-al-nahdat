-- Nmat Al Nahdat - Supabase database
-- Run this entire file once in Supabase SQL Editor.
-- This design stores the application's existing JSON records without forcing
-- you to rewrite the current UI data model.

create table if not exists public.app_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_key text not null,
  data_value jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, data_key)
);

create index if not exists app_data_user_id_idx on public.app_data(user_id);

alter table public.app_data enable row level security;

-- Remove/recreate policies so the script can safely be run again.
drop policy if exists "Users can read their own app data" on public.app_data;
drop policy if exists "Users can insert their own app data" on public.app_data;
drop policy if exists "Users can update their own app data" on public.app_data;
drop policy if exists "Users can delete their own app data" on public.app_data;

create policy "Users can read their own app data"
  on public.app_data for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own app data"
  on public.app_data for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own app data"
  on public.app_data for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own app data"
  on public.app_data for delete
  to authenticated
  using (auth.uid() = user_id);

-- Optional helper view for quick inspection in Table Editor/SQL.
create or replace view public.my_app_data as
select id, user_id, data_key, data_value, updated_at
from public.app_data
where auth.uid() = user_id;
