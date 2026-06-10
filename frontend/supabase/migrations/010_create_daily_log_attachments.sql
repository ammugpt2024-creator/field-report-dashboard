create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'daily-log-attachments',
  'daily-log-attachments',
  false,
  26214400,
  array[
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
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.daily_log_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id bigint null,
  project_id bigint null,
  daily_log_id bigint not null references public.daily_logs(id) on delete cascade,
  activity_id bigint not null references public.daily_log_activities(id) on delete cascade,
  report_id bigint null references public.daily_log_activity_reports(id) on delete set null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  storage_path text not null,
  attachment_type text not null check (attachment_type in ('photo', 'file')),
  uploaded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

alter table public.daily_log_attachments enable row level security;

create index if not exists idx_daily_log_attachments_daily_log_id on public.daily_log_attachments (daily_log_id);
create index if not exists idx_daily_log_attachments_activity_id on public.daily_log_attachments (activity_id);
create index if not exists idx_daily_log_attachments_report_id on public.daily_log_attachments (report_id);
create index if not exists idx_daily_log_attachments_project_id on public.daily_log_attachments (project_id);

drop policy if exists "Daily log attachment owner read" on public.daily_log_attachments;
create policy "Daily log attachment owner read"
on public.daily_log_attachments
for select
to authenticated
using (
  deleted_at is null
  and (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.daily_logs dl
      where dl.id = daily_log_attachments.daily_log_id
        and dl.technician_id = auth.uid()
    )
  )
);

drop policy if exists "Daily log attachment owner insert" on public.daily_log_attachments;
create policy "Daily log attachment owner insert"
on public.daily_log_attachments
for insert
to authenticated
with check (uploaded_by = auth.uid());

drop policy if exists "Daily log attachment owner update" on public.daily_log_attachments;
create policy "Daily log attachment owner update"
on public.daily_log_attachments
for update
to authenticated
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());

drop policy if exists "Daily log attachment owner soft delete" on public.daily_log_attachments;
create policy "Daily log attachment owner soft delete"
on public.daily_log_attachments
for delete
to authenticated
using (uploaded_by = auth.uid());

drop policy if exists "Daily log attachment storage owner read" on storage.objects;
create policy "Daily log attachment storage owner read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'daily-log-attachments');

drop policy if exists "Daily log attachment storage owner insert" on storage.objects;
create policy "Daily log attachment storage owner insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'daily-log-attachments');

drop policy if exists "Daily log attachment storage owner update" on storage.objects;
create policy "Daily log attachment storage owner update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'daily-log-attachments')
with check (bucket_id = 'daily-log-attachments');

drop policy if exists "Daily log attachment storage owner delete" on storage.objects;
create policy "Daily log attachment storage owner delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'daily-log-attachments');
