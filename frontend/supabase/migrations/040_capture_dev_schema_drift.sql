-- Capture columns that were added to the dev project manually, outside the
-- migration history (observed by diffing dev against a fresh replay of the
-- chain, 2026-07-08). Idempotent: every statement no-ops where the column or
-- type already matches.

alter table public.concrete_attachments add column if not exists file_size bigint;
alter table public.concrete_attachments add column if not exists file_type text;
alter table public.concrete_attachments add column if not exists uploaded_by uuid;

alter table public.concrete_delivery_testing_records add column if not exists break_pattern text;
alter table public.concrete_delivery_testing_records add column if not exists updated_at timestamptz default now();

alter table public.concrete_specifications add column if not exists dfr_number text;
alter table public.concrete_specifications add column if not exists updated_at timestamptz default now();

alter table public.concrete_test_logs add column if not exists created_at timestamptz default now();
alter table public.concrete_test_logs add column if not exists created_by uuid;
alter table public.concrete_test_logs add column if not exists gc_representative text;
alter table public.concrete_test_logs add column if not exists general_contractor text;
alter table public.concrete_test_logs add column if not exists inspection_type text default 'Concrete Placement Record'::text;
alter table public.concrete_test_logs add column if not exists project_location text;
alter table public.concrete_test_logs add column if not exists report_type text default 'Material Assurance Report'::text;
alter table public.concrete_test_logs add column if not exists technician_name text;

alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.projects add column if not exists batch_plant text;
alter table public.projects add column if not exists client_logo_url text;
alter table public.projects add column if not exists company_logo_url text;
alter table public.projects add column if not exists company_name text;
alter table public.projects add column if not exists gc_representative text;
alter table public.projects add column if not exists general_contractor text;
alter table public.projects add column if not exists updated_at timestamptz default now();

-- Type drift: the base schema captured these before dev widened them.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='concrete_attachments'
               and column_name='file_size' and data_type='integer') then
    alter table public.concrete_attachments alter column file_size type bigint;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='concrete_test_logs'
               and column_name='created_at' and data_type='timestamp without time zone') then
    alter table public.concrete_test_logs alter column created_at type timestamptz;
    alter table public.concrete_test_logs alter column created_at set default now();
  end if;
end $$;
