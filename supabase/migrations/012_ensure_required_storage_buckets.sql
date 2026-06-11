insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('daily-log-pdfs', 'daily-log-pdfs', false, 52428800, array['application/pdf']),
  ('timesheet-pdfs', 'timesheet-pdfs', false, 52428800, array['application/pdf']),
  ('daily-log-attachments', 'daily-log-attachments', false, 52428800, array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.daily_logs
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists pdf_generation_status text not null default 'pending',
  add column if not exists pdf_generation_failure_reason text;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'time_cards'
  ) then
    alter table public.time_cards
      add column if not exists pdf_storage_path text,
      add column if not exists pdf_generated_at timestamptz,
      add column if not exists pdf_generation_status text not null default 'pending',
      add column if not exists pdf_generation_failure_reason text,
      add column if not exists time_in time,
      add column if not exists time_out time,
      add column if not exists break_minutes integer default 0,
      add column if not exists total_hours numeric(8, 2),
      add column if not exists is_overnight_shift boolean not null default false;
  end if;
end $$;
