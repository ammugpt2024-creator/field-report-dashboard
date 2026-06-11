-- Durable metadata for daily log attachments.
--
-- Attachments are uploaded while the log is still a local draft, before the
-- daily_logs / daily_log_activities rows (and their numeric ids) exist, so the
-- numeric columns are nullable with no FK constraints and records are keyed on
-- the client-side uuids that are embedded in storage_path.
-- (The original create-table migration was never applied remotely, so this
-- migration is self-contained.)

create table if not exists public.daily_log_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id bigint null,
  project_id bigint null,
  daily_log_id bigint null,
  activity_id bigint null,
  report_id bigint null,
  local_daily_log_id text null,
  local_activity_id text null,
  local_report_id text null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  storage_path text not null,
  storage_bucket text null,
  attachment_type text not null check (attachment_type in ('photo', 'file')),
  uploaded_by uuid null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

-- In case an older shape of the table exists in some environment.
alter table public.daily_log_attachments add column if not exists local_daily_log_id text null;
alter table public.daily_log_attachments add column if not exists local_activity_id text null;
alter table public.daily_log_attachments add column if not exists local_report_id text null;
alter table public.daily_log_attachments add column if not exists storage_bucket text null;
alter table public.daily_log_attachments alter column daily_log_id drop not null;
alter table public.daily_log_attachments alter column activity_id drop not null;

alter table public.daily_log_attachments enable row level security;

create index if not exists idx_daily_log_attachments_daily_log_id
  on public.daily_log_attachments (daily_log_id);
create index if not exists idx_daily_log_attachments_activity_id
  on public.daily_log_attachments (activity_id);
create index if not exists idx_daily_log_attachments_local_daily_log_id
  on public.daily_log_attachments (local_daily_log_id);
create index if not exists idx_daily_log_attachments_local_activity_id
  on public.daily_log_attachments (local_activity_id);

-- storage_path uniquely identifies an uploaded object; lets the client upsert
-- idempotently on retries.
create unique index if not exists idx_daily_log_attachments_storage_path
  on public.daily_log_attachments (storage_path);

drop policy if exists "Daily log attachment owner read" on public.daily_log_attachments;
create policy "Daily log attachment owner read"
on public.daily_log_attachments
for select
to authenticated
using (deleted_at is null and uploaded_by = auth.uid());

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

-- QC reviewers and admins read attachment records during review.
drop policy if exists "Daily log attachment reviewer read" on public.daily_log_attachments;
create policy "Daily log attachment reviewer read"
on public.daily_log_attachments
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('qc', 'qc_approver', 'qc_manager', 'admin')
  )
);
