create extension if not exists pgcrypto;

alter table public.daily_logs
  add column if not exists client_log_id text,
  add column if not exists submitted_by uuid null references auth.users(id) on delete set null,
  add column if not exists signature_id uuid null,
  add column if not exists pdf_url text,
  add column if not exists pdf_generated boolean not null default false,
  add column if not exists payload jsonb not null default '{}'::jsonb;

drop index if exists public.idx_daily_logs_client_log_id;
create unique index if not exists idx_daily_logs_client_log_id
  on public.daily_logs (client_log_id);

create table if not exists public.daily_log_signatures (
  id uuid primary key default gen_random_uuid(),
  client_daily_log_id text not null,
  daily_log_id bigint null references public.daily_logs(id) on delete cascade,
  signed_by uuid null references auth.users(id) on delete set null,
  signature_data_url text not null,
  created_at timestamptz not null default now()
);

alter table public.daily_log_signatures enable row level security;

create index if not exists idx_daily_log_signatures_client_daily_log_id
  on public.daily_log_signatures (client_daily_log_id);

create index if not exists idx_daily_log_signatures_signed_by
  on public.daily_log_signatures (signed_by);

drop policy if exists "Daily log signatures owner read" on public.daily_log_signatures;
create policy "Daily log signatures owner read"
on public.daily_log_signatures
for select
to authenticated
using (signed_by = auth.uid());

drop policy if exists "Daily log signatures owner insert" on public.daily_log_signatures;
create policy "Daily log signatures owner insert"
on public.daily_log_signatures
for insert
to authenticated
with check (signed_by = auth.uid());

drop policy if exists "Technicians can manage own daily logs" on public.daily_logs;
create policy "Technicians can manage own daily logs"
  on public.daily_logs for all
  to authenticated
  using (technician_id = auth.uid())
  with check (technician_id = auth.uid());
