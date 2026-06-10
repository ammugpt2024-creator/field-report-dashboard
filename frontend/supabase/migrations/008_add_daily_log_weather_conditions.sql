alter table public.daily_logs
  add column if not exists temperature numeric null,
  add column if not exists humidity numeric null,
  add column if not exists wind_speed numeric null,
  add column if not exists rain_probability numeric null,
  add column if not exists weather_condition text null,
  add column if not exists weather_captured_at timestamptz null,
  add column if not exists weather_override text null,
  add column if not exists weather_override_reason text null,
  add column if not exists site_conditions text null;

create index if not exists idx_daily_logs_weather_captured_at
  on public.daily_logs (weather_captured_at desc);
