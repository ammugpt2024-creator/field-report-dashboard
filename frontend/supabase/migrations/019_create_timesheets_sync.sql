-- Shared mirror of technician timesheets (see timesheetSyncService.js).
-- localStorage remains the technician's working copy; this table is the
-- shared source of truth for anything past draft, so managers can review
-- and approve from any device. Schema matches the service's documented DDL.

create table if not exists public.timesheets (
  id text primary key,
  timesheet_number text,
  technician_name text,
  week_start_date date,
  week_end_date date,
  status text default 'submitted',
  total_regular_hours numeric default 0,
  total_overtime_hours numeric default 0,
  total_hours numeric default 0,
  payload jsonb not null,
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  manager_comment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.timesheets enable row level security;

create index if not exists idx_timesheets_status on public.timesheets (status);
create index if not exists idx_timesheets_technician_name on public.timesheets (technician_name);

-- The app is fully authenticated; technicians sync their own cards and
-- managers read/update the queue.
drop policy if exists "timesheets_open" on public.timesheets;
create policy "timesheets_open"
on public.timesheets
for all
to authenticated
using (true)
with check (true);
