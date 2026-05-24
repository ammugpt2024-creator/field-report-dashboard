alter table public.concrete_test_logs
  add column if not exists status text default 'DRAFT',
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejection_reason text,
  add column if not exists revision_count integer default 0,
  add column if not exists is_locked boolean default false,
  add column if not exists qc_assigned_to uuid,
  add column if not exists pdf_url text,
  add column if not exists final_pdf_url text,
  add column if not exists pdf_storage_path text,
  add column if not exists technician_signature_url text,
  add column if not exists technician_signature_storage_path text,
  add column if not exists qc_signature_url text,
  add column if not exists qc_signature_storage_path text,
  add column if not exists submitted_by_name text,
  add column if not exists submitted_by_email text,
  add column if not exists reviewed_by_name text,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_concrete_test_logs_status
on public.concrete_test_logs using btree (status);

create index if not exists idx_concrete_test_logs_qc_assigned_to
on public.concrete_test_logs using btree (qc_assigned_to);

create index if not exists idx_concrete_test_logs_submitted_at
on public.concrete_test_logs using btree (submitted_at);

create table if not exists public.report_review_history (
  id uuid primary key default gen_random_uuid(),
  report_id bigint not null references public.concrete_test_logs(id) on delete cascade,
  action text not null,
  remarks text,
  performed_by uuid,
  performed_by_name text,
  performed_by_role text,
  performed_at timestamptz not null default now()
);

create index if not exists idx_report_review_history_report_id
on public.report_review_history using btree (report_id);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  report_id bigint references public.concrete_test_logs(id) on delete cascade,
  recipient_email text,
  subject text,
  body_html text,
  notification_type text,
  status text not null default 'pending',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_queue_report_id
on public.notification_queue using btree (report_id);

create index if not exists idx_notification_queue_status
on public.notification_queue using btree (status);

create or replace function public.touch_concrete_test_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_concrete_test_logs_updated_at on public.concrete_test_logs;
create trigger trg_touch_concrete_test_logs_updated_at
before update on public.concrete_test_logs
for each row
execute function public.touch_concrete_test_logs_updated_at();
