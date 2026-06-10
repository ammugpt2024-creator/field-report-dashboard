alter table public.concrete_test_logs
  add column if not exists daily_log_id text null,
  add column if not exists activity_id text null,
  add column if not exists source_report_id text null;

create index if not exists idx_concrete_test_logs_daily_log_id
  on public.concrete_test_logs (daily_log_id);

create index if not exists idx_concrete_test_logs_activity_id
  on public.concrete_test_logs (activity_id);

