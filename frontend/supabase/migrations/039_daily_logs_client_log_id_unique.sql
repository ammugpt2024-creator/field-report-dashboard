-- The upsert in submitDailyLogToSupabase uses ON CONFLICT (client_log_id),
-- which requires a unique index on that column. Without it PostgreSQL throws
-- "there is no unique constraint matching the given keys" and every daily log
-- submission fails. Use a partial index so existing NULL rows don't conflict.
create unique index if not exists daily_logs_client_log_id_unique
  on public.daily_logs (client_log_id)
  where client_log_id is not null;
