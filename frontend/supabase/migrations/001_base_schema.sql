-- Base schema extracted from the production project (tables that predate
-- the migration history). Generated 2026-06-12.

create sequence if not exists public.ai_audit_events_id_seq;
create sequence if not exists public.ai_summarys_id_seq;
create sequence if not exists public.concrete_attachments_id_seq;
create sequence if not exists public.concrete_delivery_testing_records_id_seq;
create sequence if not exists public.concrete_specifications_id_seq;
create sequence if not exists public.concrete_test_logs_id_seq;
create sequence if not exists public.daily_log_activities_id_seq;
create sequence if not exists public.daily_log_activity_photos_id_seq;
create sequence if not exists public.daily_log_activity_reports_id_seq;
create sequence if not exists public.daily_log_comments_id_seq;
create sequence if not exists public.daily_log_reviews_id_seq;
create sequence if not exists public.daily_logs_id_seq;
create sequence if not exists public.projects_id_seq;
create sequence if not exists public.workflow_status_id_seq;

create table if not exists public.profiles (
  id uuid not null,
  email text not null,
  full_name text,
  role text default 'technician'::text,
  company_name text,
  created_at timestamptz default timezone('utc'::text, now()),
  overtime_exempt boolean default false
);

create table if not exists public.projects (
  id bigint not null,
  project_name text not null,
  project_number text not null,
  client_name text not null,
  client_representative text,
  project_location text,
  status text,
  created_at timestamptz default now(),
  project_manager_id uuid,
  project_manager_email text,
  project_manager_name text,
  overtime_exempt boolean default false
);

create table if not exists public.concrete_test_logs (
  id bigint not null,
  project_id bigint,
  project_name text,
  project_number text,
  date_sampled date,
  weather text,
  min_temp text,
  max_temp text,
  location text,
  batch_plant text,
  gc text,
  gc_rep text,
  data_logger text,
  sub_contractor text,
  dfr_number text,
  time_in time,
  time_out time,
  total_quantity_placed text,
  air_content_spec text,
  unit_weight_spec text,
  slump_spec text,
  j_ring_spec text,
  spread_spec text,
  strength_spec text,
  mix_no_spec text,
  created_at timestamp default now(),
  status text default 'DRAFT'::text,
  submitted_at timestamptz,
  submitted_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text,
  revision_count integer default 0,
  is_locked boolean default false,
  qc_assigned_to uuid,
  pdf_url text,
  final_pdf_url text,
  pdf_storage_path text,
  technician_signature_url text,
  technician_signature_storage_path text,
  submitted_by_name text,
  submitted_by_email text,
  reviewed_by_name text,
  updated_at timestamptz default now(),
  qc_signature_url text,
  qc_signature_storage_path text,
  daily_log_id text,
  activity_id text,
  source_report_id text
);

create table if not exists public.concrete_specifications (
  id bigint not null,
  log_id bigint,
  air_content text,
  unit_weight text,
  spread text,
  slump text,
  concrete_temp text,
  mix_no text,
  j_ring text,
  speed_of_stress text,
  report_time text,
  comments text,
  created_at timestamptz default now()
);

create table if not exists public.concrete_delivery_testing_records (
  id bigint not null,
  log_id bigint,
  test_number text,
  ticket_number text,
  truck_number text,
  cubic_yards text,
  total_placed_qty numeric,
  mix_design text,
  time_batched text,
  arrival_time text,
  time_tested text,
  finish_unload text,
  actual_minutes text,
  water_added_gal text,
  air_temp_f text,
  concrete_temp_f text,
  slump_in text,
  air_content_percent text,
  unit_weight_lbs_ft3 text,
  j_ring_in text,
  spread_in text,
  set_number text,
  lab_cylinders text,
  field_cylinders text,
  placement_location text,
  comments text,
  created_at timestamptz default now(),
  start_placement text,
  strength_verification_required text,
  row_status text
);

create table if not exists public.concrete_attachments (
  id bigint default nextval('concrete_attachments_id_seq'::regclass) not null,
  log_id bigint not null,
  category text not null,
  file_name text not null,
  file_url text not null,
  storage_path text not null,
  content_type text,
  file_size integer,
  created_at timestamptz default now() not null,
  delivery_record_id bigint
);

create table if not exists public.notification_queue (
  id uuid default gen_random_uuid() not null,
  report_id bigint,
  recipient_email text,
  subject text,
  body_html text,
  notification_type text,
  status text default 'pending'::text not null,
  error text,
  sent_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.report_review_history (
  id uuid default gen_random_uuid() not null,
  report_id bigint not null,
  action text not null,
  remarks text,
  performed_by uuid,
  performed_by_name text,
  performed_by_role text,
  performed_at timestamptz default now() not null
);

-- Pre-existing tables (older dev environments) get any missing columns.
alter table public.profiles add column if not exists id uuid;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'technician'::text;
alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists created_at timestamptz default timezone('utc'::text, now());
alter table public.profiles add column if not exists overtime_exempt boolean default false;
alter table public.projects add column if not exists id bigint;
alter table public.projects add column if not exists project_name text;
alter table public.projects add column if not exists project_number text;
alter table public.projects add column if not exists client_name text;
alter table public.projects add column if not exists client_representative text;
alter table public.projects add column if not exists project_location text;
alter table public.projects add column if not exists status text;
alter table public.projects add column if not exists created_at timestamptz default now();
alter table public.projects add column if not exists project_manager_id uuid;
alter table public.projects add column if not exists project_manager_email text;
alter table public.projects add column if not exists project_manager_name text;
alter table public.projects add column if not exists overtime_exempt boolean default false;
alter table public.concrete_test_logs add column if not exists id bigint;
alter table public.concrete_test_logs add column if not exists project_id bigint;
alter table public.concrete_test_logs add column if not exists project_name text;
alter table public.concrete_test_logs add column if not exists project_number text;
alter table public.concrete_test_logs add column if not exists date_sampled date;
alter table public.concrete_test_logs add column if not exists weather text;
alter table public.concrete_test_logs add column if not exists min_temp text;
alter table public.concrete_test_logs add column if not exists max_temp text;
alter table public.concrete_test_logs add column if not exists location text;
alter table public.concrete_test_logs add column if not exists batch_plant text;
alter table public.concrete_test_logs add column if not exists gc text;
alter table public.concrete_test_logs add column if not exists gc_rep text;
alter table public.concrete_test_logs add column if not exists data_logger text;
alter table public.concrete_test_logs add column if not exists sub_contractor text;
alter table public.concrete_test_logs add column if not exists dfr_number text;
alter table public.concrete_test_logs add column if not exists time_in time;
alter table public.concrete_test_logs add column if not exists time_out time;
alter table public.concrete_test_logs add column if not exists total_quantity_placed text;
alter table public.concrete_test_logs add column if not exists air_content_spec text;
alter table public.concrete_test_logs add column if not exists unit_weight_spec text;
alter table public.concrete_test_logs add column if not exists slump_spec text;
alter table public.concrete_test_logs add column if not exists j_ring_spec text;
alter table public.concrete_test_logs add column if not exists spread_spec text;
alter table public.concrete_test_logs add column if not exists strength_spec text;
alter table public.concrete_test_logs add column if not exists mix_no_spec text;
alter table public.concrete_test_logs add column if not exists created_at timestamp default now();
alter table public.concrete_test_logs add column if not exists status text default 'DRAFT'::text;
alter table public.concrete_test_logs add column if not exists submitted_at timestamptz;
alter table public.concrete_test_logs add column if not exists submitted_by uuid;
alter table public.concrete_test_logs add column if not exists reviewed_at timestamptz;
alter table public.concrete_test_logs add column if not exists reviewed_by uuid;
alter table public.concrete_test_logs add column if not exists approved_at timestamptz;
alter table public.concrete_test_logs add column if not exists approved_by uuid;
alter table public.concrete_test_logs add column if not exists rejected_at timestamptz;
alter table public.concrete_test_logs add column if not exists rejected_by uuid;
alter table public.concrete_test_logs add column if not exists rejection_reason text;
alter table public.concrete_test_logs add column if not exists revision_count integer default 0;
alter table public.concrete_test_logs add column if not exists is_locked boolean default false;
alter table public.concrete_test_logs add column if not exists qc_assigned_to uuid;
alter table public.concrete_test_logs add column if not exists pdf_url text;
alter table public.concrete_test_logs add column if not exists final_pdf_url text;
alter table public.concrete_test_logs add column if not exists pdf_storage_path text;
alter table public.concrete_test_logs add column if not exists technician_signature_url text;
alter table public.concrete_test_logs add column if not exists technician_signature_storage_path text;
alter table public.concrete_test_logs add column if not exists submitted_by_name text;
alter table public.concrete_test_logs add column if not exists submitted_by_email text;
alter table public.concrete_test_logs add column if not exists reviewed_by_name text;
alter table public.concrete_test_logs add column if not exists updated_at timestamptz default now();
alter table public.concrete_test_logs add column if not exists qc_signature_url text;
alter table public.concrete_test_logs add column if not exists qc_signature_storage_path text;
alter table public.concrete_test_logs add column if not exists daily_log_id text;
alter table public.concrete_test_logs add column if not exists activity_id text;
alter table public.concrete_test_logs add column if not exists source_report_id text;
alter table public.concrete_specifications add column if not exists id bigint;
alter table public.concrete_specifications add column if not exists log_id bigint;
alter table public.concrete_specifications add column if not exists air_content text;
alter table public.concrete_specifications add column if not exists unit_weight text;
alter table public.concrete_specifications add column if not exists spread text;
alter table public.concrete_specifications add column if not exists slump text;
alter table public.concrete_specifications add column if not exists concrete_temp text;
alter table public.concrete_specifications add column if not exists mix_no text;
alter table public.concrete_specifications add column if not exists j_ring text;
alter table public.concrete_specifications add column if not exists speed_of_stress text;
alter table public.concrete_specifications add column if not exists report_time text;
alter table public.concrete_specifications add column if not exists comments text;
alter table public.concrete_specifications add column if not exists created_at timestamptz default now();
alter table public.concrete_delivery_testing_records add column if not exists id bigint;
alter table public.concrete_delivery_testing_records add column if not exists log_id bigint;
alter table public.concrete_delivery_testing_records add column if not exists test_number text;
alter table public.concrete_delivery_testing_records add column if not exists ticket_number text;
alter table public.concrete_delivery_testing_records add column if not exists truck_number text;
alter table public.concrete_delivery_testing_records add column if not exists cubic_yards text;
alter table public.concrete_delivery_testing_records add column if not exists total_placed_qty numeric;
alter table public.concrete_delivery_testing_records add column if not exists mix_design text;
alter table public.concrete_delivery_testing_records add column if not exists time_batched text;
alter table public.concrete_delivery_testing_records add column if not exists arrival_time text;
alter table public.concrete_delivery_testing_records add column if not exists time_tested text;
alter table public.concrete_delivery_testing_records add column if not exists finish_unload text;
alter table public.concrete_delivery_testing_records add column if not exists actual_minutes text;
alter table public.concrete_delivery_testing_records add column if not exists water_added_gal text;
alter table public.concrete_delivery_testing_records add column if not exists air_temp_f text;
alter table public.concrete_delivery_testing_records add column if not exists concrete_temp_f text;
alter table public.concrete_delivery_testing_records add column if not exists slump_in text;
alter table public.concrete_delivery_testing_records add column if not exists air_content_percent text;
alter table public.concrete_delivery_testing_records add column if not exists unit_weight_lbs_ft3 text;
alter table public.concrete_delivery_testing_records add column if not exists j_ring_in text;
alter table public.concrete_delivery_testing_records add column if not exists spread_in text;
alter table public.concrete_delivery_testing_records add column if not exists set_number text;
alter table public.concrete_delivery_testing_records add column if not exists lab_cylinders text;
alter table public.concrete_delivery_testing_records add column if not exists field_cylinders text;
alter table public.concrete_delivery_testing_records add column if not exists placement_location text;
alter table public.concrete_delivery_testing_records add column if not exists comments text;
alter table public.concrete_delivery_testing_records add column if not exists created_at timestamptz default now();
alter table public.concrete_delivery_testing_records add column if not exists start_placement text;
alter table public.concrete_delivery_testing_records add column if not exists strength_verification_required text;
alter table public.concrete_delivery_testing_records add column if not exists row_status text;
alter table public.concrete_attachments add column if not exists id bigint default nextval('concrete_attachments_id_seq'::regclass);
alter table public.concrete_attachments add column if not exists log_id bigint;
alter table public.concrete_attachments add column if not exists category text;
alter table public.concrete_attachments add column if not exists file_name text;
alter table public.concrete_attachments add column if not exists file_url text;
alter table public.concrete_attachments add column if not exists storage_path text;
alter table public.concrete_attachments add column if not exists content_type text;
alter table public.concrete_attachments add column if not exists file_size integer;
alter table public.concrete_attachments add column if not exists created_at timestamptz default now();
alter table public.concrete_attachments add column if not exists delivery_record_id bigint;
alter table public.notification_queue add column if not exists id uuid default gen_random_uuid();
alter table public.notification_queue add column if not exists report_id bigint;
alter table public.notification_queue add column if not exists recipient_email text;
alter table public.notification_queue add column if not exists subject text;
alter table public.notification_queue add column if not exists body_html text;
alter table public.notification_queue add column if not exists notification_type text;
alter table public.notification_queue add column if not exists status text default 'pending'::text;
alter table public.notification_queue add column if not exists error text;
alter table public.notification_queue add column if not exists sent_at timestamptz;
alter table public.notification_queue add column if not exists created_at timestamptz default now();
alter table public.report_review_history add column if not exists id uuid default gen_random_uuid();
alter table public.report_review_history add column if not exists report_id bigint;
alter table public.report_review_history add column if not exists action text;
alter table public.report_review_history add column if not exists remarks text;
alter table public.report_review_history add column if not exists performed_by uuid;
alter table public.report_review_history add column if not exists performed_by_name text;
alter table public.report_review_history add column if not exists performed_by_role text;
alter table public.report_review_history add column if not exists performed_at timestamptz default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'concrete_attachments_pkey') then
    alter table public.concrete_attachments add constraint concrete_attachments_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'concrete_delivery_testing_records_pkey') then
    alter table public.concrete_delivery_testing_records add constraint concrete_delivery_testing_records_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'concrete_specifications_pkey') then
    alter table public.concrete_specifications add constraint concrete_specifications_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'concrete_test_logs_pkey') then
    alter table public.concrete_test_logs add constraint concrete_test_logs_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_queue_pkey') then
    alter table public.notification_queue add constraint notification_queue_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_pkey') then
    alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_pkey') then
    alter table public.projects add constraint projects_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'report_review_history_pkey') then
    alter table public.report_review_history add constraint report_review_history_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'concrete_specifications_log_id_key') then
    alter table public.concrete_specifications add constraint concrete_specifications_log_id_key UNIQUE (log_id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_project_name_key') then
    alter table public.projects add constraint projects_project_name_key UNIQUE (project_name);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_project_number_key') then
    alter table public.projects add constraint projects_project_number_key UNIQUE (project_number);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_queue_report_id_fkey') then
    alter table public.notification_queue add constraint notification_queue_report_id_fkey FOREIGN KEY (report_id) REFERENCES concrete_test_logs(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_project_manager_id_fkey') then
    alter table public.projects add constraint projects_project_manager_id_fkey FOREIGN KEY (project_manager_id) REFERENCES profiles(id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'report_review_history_report_id_fkey') then
    alter table public.report_review_history add constraint report_review_history_report_id_fkey FOREIGN KEY (report_id) REFERENCES concrete_test_logs(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.is_qc_reviewer()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('qc', 'qc_approver', 'qc_manager', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.touch_concrete_test_logs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_ai_summarys_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists trg_touch_concrete_test_logs_updated_at on public.concrete_test_logs;
CREATE TRIGGER trg_touch_concrete_test_logs_updated_at BEFORE UPDATE ON public.concrete_test_logs FOR EACH ROW EXECUTE FUNCTION touch_concrete_test_logs_updated_at();


create sequence if not exists public.daily_log_signatures_id_seq;

create table if not exists public.daily_log_signatures (
  id uuid default gen_random_uuid() not null,
  client_daily_log_id text not null,
  daily_log_id bigint,
  signed_by uuid,
  signature_data_url text not null,
  created_at timestamptz default now() not null
);

-- daily_logs is created later (006_create_daily_log_workflow); on a fresh
-- database this FK is added there instead. The guard keeps this file replayable
-- against databases where daily_logs already exists.
do $$ begin
  if to_regclass('public.daily_logs') is not null
     and not exists (select 1 from pg_constraint where conname = 'daily_log_signatures_daily_log_id_fkey') then
    alter table public.daily_log_signatures add constraint daily_log_signatures_daily_log_id_fkey FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'daily_log_signatures_pkey') then
    alter table public.daily_log_signatures add constraint daily_log_signatures_pkey PRIMARY KEY (id);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'daily_log_signatures_signed_by_fkey') then
    alter table public.daily_log_signatures add constraint daily_log_signatures_signed_by_fkey FOREIGN KEY (signed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

-- Columns that drifted onto migration-created tables outside the migration
-- history (applied to dev manually; kept here for reproducibility).
alter table if exists public.daily_logs add column if not exists client_log_id text;
alter table if exists public.daily_logs add column if not exists submitted_by uuid;
alter table if exists public.daily_logs add column if not exists signature_id uuid;
alter table if exists public.daily_logs add column if not exists pdf_url text;
alter table if exists public.daily_logs add column if not exists payload jsonb default '{}'::jsonb;
alter table if exists public.daily_logs add column if not exists pdf_generated boolean default false;
