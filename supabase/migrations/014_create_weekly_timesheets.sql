create table if not exists public.weekly_timesheets (
  id uuid primary key default gen_random_uuid(),
  timesheet_number text not null unique,
  employee_id uuid,
  employee_name text not null,
  project_id bigint,
  project_name text,
  week_start_date date not null,
  week_end_date date not null,
  status text not null default 'draft',
  total_regular_hours numeric(10, 2) not null default 0,
  total_overtime_hours numeric(10, 2) not null default 0,
  total_hours numeric(10, 2) not null default 0,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.weekly_timesheets(id) on delete cascade,
  work_date date not null,
  day_name text not null,
  project_id bigint,
  cost_code text,
  work_description text,
  time_in time,
  time_out time,
  break_minutes integer not null default 0,
  regular_hours numeric(10, 2) not null default 0,
  overtime_hours numeric(10, 2) not null default 0,
  total_hours numeric(10, 2) not null default 0,
  source_dfr_id uuid,
  source_dfr_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (timesheet_id, work_date)
);

create index if not exists weekly_timesheets_employee_idx
  on public.weekly_timesheets(employee_id, week_start_date desc);

create index if not exists weekly_timesheets_project_idx
  on public.weekly_timesheets(project_id, week_start_date desc);

create index if not exists weekly_timesheets_status_idx
  on public.weekly_timesheets(status);

create index if not exists weekly_timesheet_entries_timesheet_idx
  on public.weekly_timesheet_entries(timesheet_id, work_date);
