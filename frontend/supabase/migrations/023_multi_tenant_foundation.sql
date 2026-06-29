-- ════════════════════════════════════════════════════════════════════════════
-- QCore multi-tenant SaaS foundation.
--
-- Two admin levels: platform admins (own the product, manage companies and
-- subscriptions, never casually touch tenant data) and company admins (manage
-- exactly one company). Every tenant table carries company_id, stamped
-- automatically on insert via auth_company_id(), and RLS confines every
-- company-level read/write to the caller's company.
--
-- Existing tables map onto the spec's names and KEEP their names so no
-- functionality is lost:
--   daily_reports      → public.daily_logs (+ daily_log_* children)
--   field_test_reports → public.concrete_test_logs (+ concrete_* children)
--   timesheets         → public.timesheets
--   notifications      → public.notification_queue
-- All existing rows and users are adopted into a seeded default company.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper functions reference tables created later in this migration.
set check_function_bodies = off;

-- ── Tenant helper functions ─────────────────────────────────────────────────

-- The caller's company. SECURITY DEFINER so it can read company_users without
-- tripping that table's own RLS (no recursion).
create or replace function public.auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.company_users
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.has_company_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_users
    where user_id = auth.uid()
      and status = 'active'
      and role = any (required_roles)
  );
$$;

-- ── Platform-level tables ───────────────────────────────────────────────────

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  legal_name text,
  logo_url text,
  logo_storage_path text,
  brand_color text default '#1d4ed8',
  primary_contact_name text,
  primary_contact_email text,
  phone text,
  address text,
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'starter', 'professional', 'enterprise')),
  billing_status text not null default 'current' check (billing_status in ('current', 'past_due', 'cancelled')),
  seats integer default 10,
  current_period_start date,
  current_period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  timezone text default 'America/New_York',
  default_shift text default 'Day Shift',
  overtime_threshold_hours numeric default 40,
  notification_settings jsonb not null default '{}'::jsonb,
  field_report_templates jsonb not null default '[]'::jsonb,
  lab_report_templates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Company membership and the SaaS role taxonomy. profiles.role keeps the
-- legacy values so existing flows are untouched; this is the tenant-aware
-- source of truth for the new areas.
create table if not exists public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text,
  full_name text,
  role text not null default 'technician' check (role in (
    'company_admin', 'project_manager', 'deputy_project_manager',
    'technician', 'inspector', 'lab_technician', 'viewer'
  )),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

-- Support access is explicit and audited — platform admins have no standing
-- access to tenant data.
create table if not exists public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  platform_admin_id uuid not null references auth.users (id),
  reason text,
  read_only boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- ── Company-level tables ────────────────────────────────────────────────────

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  client_name text not null,
  client_type text default 'owner' check (client_type in ('owner', 'general_contractor', 'agency', 'utility', 'developer', 'other')),
  contact_name text,
  contact_email text,
  phone text,
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  project_id bigint not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  assignment_role text default 'technician',
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  equipment_name text not null,
  equipment_type text,
  serial_number text,
  model text,
  status text not null default 'in_service' check (status in ('in_service', 'out_of_service', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_calibrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  calibrated_on date not null,
  calibration_due date,
  certificate_storage_path text,
  performed_by text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  project_id bigint references public.projects (id) on delete set null,
  invoice_number text not null,
  client_id uuid references public.clients (id) on delete set null,
  amount numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'review', 'approved', 'rejected', 'paid', 'archived')),
  issued_on date,
  due_on date,
  pdf_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  project_id bigint references public.projects (id) on delete set null,
  report_number text,
  sample_id text,
  test_type text,
  specimen_date date,
  break_date date,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'review', 'approved', 'rejected', 'archived')),
  submitted_by uuid references auth.users (id),
  reviewed_by uuid references auth.users (id),
  pdf_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  actor_user_id uuid references auth.users (id),
  action text not null,
  entity_type text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_company_created_idx on public.audit_logs (company_id, created_at desc);

-- ── company_id on existing tenant tables ────────────────────────────────────
-- default auth_company_id() means existing insert code stamps the tenant
-- automatically — zero application changes required to stay correct.

alter table public.profiles add column if not exists company_id uuid references public.companies (id);
alter table public.projects add column if not exists company_id uuid default public.auth_company_id() references public.companies (id);
alter table public.daily_logs add column if not exists company_id uuid default public.auth_company_id() references public.companies (id);
alter table public.concrete_test_logs add column if not exists company_id uuid default public.auth_company_id() references public.companies (id);
alter table public.concrete_specifications add column if not exists company_id uuid default public.auth_company_id();
alter table public.concrete_delivery_testing_records add column if not exists company_id uuid default public.auth_company_id();
alter table public.concrete_attachments add column if not exists company_id uuid default public.auth_company_id();
alter table public.timesheets add column if not exists company_id uuid default public.auth_company_id() references public.companies (id);
alter table public.notification_queue add column if not exists company_id uuid default public.auth_company_id();
alter table public.report_review_history add column if not exists company_id uuid default public.auth_company_id();
do $$ begin
  -- Legacy bigint company_id (every value null) becomes the tenant uuid.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'daily_log_attachments'
               and column_name = 'company_id' and udt_name = 'int8') then
    alter table public.daily_log_attachments alter column company_id type uuid using null::uuid;
    alter table public.daily_log_attachments alter column company_id set default public.auth_company_id();
  else
    alter table public.daily_log_attachments add column if not exists company_id uuid default public.auth_company_id();
  end if;
end $$;

-- ── Seed: adopt the existing single-company installation ────────────────────

do $$
declare
  seed_company uuid;
begin
  select id into seed_company from public.companies where company_name = 'Dulles Engineering, Inc.';
  if seed_company is null then
    insert into public.companies (company_name, legal_name, primary_contact_email, status, brand_color)
    values ('Dulles Engineering, Inc.', 'Dulles Engineering, Inc.', 'indrav2025@gmail.com', 'active', '#1d4ed8')
    returning id into seed_company;

    insert into public.company_settings (company_id) values (seed_company);
    insert into public.company_subscriptions (company_id, plan, billing_status, current_period_start, current_period_end)
    values (seed_company, 'enterprise', 'current', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date);
  end if;

  -- Memberships for every existing profile, mapping legacy roles onto the
  -- SaaS taxonomy. profiles.role keeps its legacy value untouched.
  insert into public.company_users (company_id, user_id, invited_email, full_name, role, status)
  select
    seed_company,
    p.id,
    p.email,
    p.full_name,
    case lower(coalesce(p.role, ''))
      when 'admin' then 'company_admin'
      when 'qc_manager' then 'company_admin'
      when 'project_manager' then 'project_manager'
      when 'manager' then 'project_manager'
      when 'qc' then 'inspector'
      when 'qc_approver' then 'inspector'
      when 'technician' then 'technician'
      else 'viewer'
    end,
    'active'
  from public.profiles p
  on conflict (company_id, user_id) do nothing;

  -- Bootstrap platform ownership so the product owner can reach /platform-admin.
  insert into public.platform_admins (user_id, full_name, email)
  select p.id, p.full_name, p.email from public.profiles p
  where lower(p.email) = 'indrav2025@gmail.com'
  on conflict (user_id) do nothing;

  -- Adopt all existing tenant rows.
  update public.profiles set company_id = seed_company where company_id is null;
  update public.projects set company_id = seed_company where company_id is null;
  update public.daily_logs set company_id = seed_company where company_id is null;
  update public.concrete_test_logs set company_id = seed_company where company_id is null;
  update public.concrete_specifications set company_id = seed_company where company_id is null;
  update public.concrete_delivery_testing_records set company_id = seed_company where company_id is null;
  update public.concrete_attachments set company_id = seed_company where company_id is null;
  update public.timesheets set company_id = seed_company where company_id is null;
  update public.notification_queue set company_id = seed_company where company_id is null;
  update public.report_review_history set company_id = seed_company where company_id is null;
  update public.daily_log_attachments set company_id = seed_company where company_id is null;
end $$;

-- ── RLS: tenant isolation ───────────────────────────────────────────────────

-- companies: members see their own; platform admins manage all; company
-- admins may update their own company's profile/branding.
alter table public.companies enable row level security;
drop policy if exists "Members read own company" on public.companies;
create policy "Members read own company" on public.companies
  for select to authenticated using (id = public.auth_company_id() or public.is_platform_admin());
drop policy if exists "Platform admins manage companies" on public.companies;
create policy "Platform admins manage companies" on public.companies
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "Company admins update own company" on public.companies;
create policy "Company admins update own company" on public.companies
  for update to authenticated
  using (id = public.auth_company_id() and public.has_company_role(array['company_admin']))
  with check (id = public.auth_company_id());

alter table public.platform_admins enable row level security;
drop policy if exists "Platform admins manage platform admins" on public.platform_admins;
create policy "Platform admins manage platform admins" on public.platform_admins
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "Users read own platform admin row" on public.platform_admins;
create policy "Users read own platform admin row" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

alter table public.company_subscriptions enable row level security;
drop policy if exists "Members read own subscription" on public.company_subscriptions;
create policy "Members read own subscription" on public.company_subscriptions
  for select to authenticated using (company_id = public.auth_company_id() or public.is_platform_admin());
drop policy if exists "Platform admins manage subscriptions" on public.company_subscriptions;
create policy "Platform admins manage subscriptions" on public.company_subscriptions
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

alter table public.company_settings enable row level security;
drop policy if exists "Members read own settings" on public.company_settings;
create policy "Members read own settings" on public.company_settings
  for select to authenticated using (company_id = public.auth_company_id() or public.is_platform_admin());
drop policy if exists "Company admins manage own settings" on public.company_settings;
create policy "Company admins manage own settings" on public.company_settings
  for all to authenticated
  using ((company_id = public.auth_company_id() and public.has_company_role(array['company_admin'])) or public.is_platform_admin())
  with check ((company_id = public.auth_company_id() and public.has_company_role(array['company_admin'])) or public.is_platform_admin());

alter table public.company_users enable row level security;
drop policy if exists "Members read own roster" on public.company_users;
create policy "Members read own roster" on public.company_users
  for select to authenticated using (company_id = public.auth_company_id() or public.is_platform_admin());
drop policy if exists "Company admins manage roster" on public.company_users;
create policy "Company admins manage roster" on public.company_users
  for all to authenticated
  using ((company_id = public.auth_company_id() and public.has_company_role(array['company_admin'])) or public.is_platform_admin())
  with check ((company_id = public.auth_company_id() and public.has_company_role(array['company_admin'])) or public.is_platform_admin());

alter table public.platform_support_sessions enable row level security;
drop policy if exists "Platform admins manage support sessions" on public.platform_support_sessions;
create policy "Platform admins manage support sessions" on public.platform_support_sessions
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "Company admins see support sessions" on public.platform_support_sessions;
create policy "Company admins see support sessions" on public.platform_support_sessions
  for select to authenticated using (company_id = public.auth_company_id() and public.has_company_role(array['company_admin']));

-- Company-scoped CRUD for the new business tables.
do $$
declare t text;
begin
  foreach t in array array['clients', 'project_assignments', 'equipment', 'equipment_calibrations', 'invoices', 'lab_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Company members access" on public.%I', t);
    execute format(
      'create policy "Company members access" on public.%I for all to authenticated using (company_id = public.auth_company_id()) with check (company_id = public.auth_company_id())', t);
  end loop;
end $$;

alter table public.audit_logs enable row level security;
drop policy if exists "Members write own company audit" on public.audit_logs;
create policy "Members write own company audit" on public.audit_logs
  for insert to authenticated
  with check (company_id = public.auth_company_id() or public.is_platform_admin());
drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs" on public.audit_logs
  for select to authenticated
  using ((company_id = public.auth_company_id() and public.has_company_role(array['company_admin', 'project_manager'])) or public.is_platform_admin());

-- Tighten the existing tenant tables from authenticated-wide to company-scoped.
do $$
declare t text;
begin
  foreach t in array array['concrete_test_logs', 'concrete_specifications', 'concrete_delivery_testing_records', 'concrete_attachments', 'report_review_history'] loop
    execute format('drop policy if exists "Authenticated full access" on public.%I', t);
    execute format('drop policy if exists "Company scoped access" on public.%I', t);
    execute format(
      'create policy "Company scoped access" on public.%I for all to authenticated using (company_id = public.auth_company_id()) with check (company_id = public.auth_company_id())', t);
  end loop;
end $$;

drop policy if exists "Projects readable by authenticated" on public.projects;
drop policy if exists "Company members read projects" on public.projects;
create policy "Company members read projects" on public.projects
  for select to authenticated using (company_id = public.auth_company_id());
drop policy if exists "Company admins manage projects" on public.projects;
create policy "Company admins manage projects" on public.projects
  for all to authenticated
  using (company_id = public.auth_company_id() and public.has_company_role(array['company_admin', 'project_manager']))
  with check (company_id = public.auth_company_id() and public.has_company_role(array['company_admin', 'project_manager']));

drop policy if exists "Profiles readable by authenticated" on public.profiles;
drop policy if exists "Company members read profiles" on public.profiles;
create policy "Company members read profiles" on public.profiles
  for select to authenticated
  using (id = auth.uid() or company_id = public.auth_company_id() or public.is_platform_admin());

drop policy if exists "timesheets_open" on public.timesheets;
drop policy if exists "Company scoped timesheets" on public.timesheets;
create policy "Company scoped timesheets" on public.timesheets
  for all to authenticated
  using (company_id = public.auth_company_id())
  with check (company_id = public.auth_company_id());

drop policy if exists "Authenticated queue insert" on public.notification_queue;
drop policy if exists "Authenticated queue read" on public.notification_queue;
drop policy if exists "Authenticated queue update" on public.notification_queue;
drop policy if exists "Company scoped queue" on public.notification_queue;
create policy "Company scoped queue" on public.notification_queue
  for all to authenticated
  using (company_id = public.auth_company_id())
  with check (company_id = public.auth_company_id());

-- ── Storage: one private bucket, strict per-company prefixes ────────────────
-- company-{company_id}/logos | daily-reports | field-tests | lab-reports |
-- timesheets | invoices | calibration-certificates

insert into storage.buckets (id, name, public)
values ('company-files', 'company-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Company files isolation read" on storage.objects;
create policy "Company files isolation read" on storage.objects
  for select to authenticated
  using (bucket_id = 'company-files' and (storage.foldername(name))[1] = 'company-' || public.auth_company_id()::text);
drop policy if exists "Company files isolation insert" on storage.objects;
create policy "Company files isolation insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-files' and (storage.foldername(name))[1] = 'company-' || public.auth_company_id()::text);
drop policy if exists "Company files isolation update" on storage.objects;
create policy "Company files isolation update" on storage.objects
  for update to authenticated
  using (bucket_id = 'company-files' and (storage.foldername(name))[1] = 'company-' || public.auth_company_id()::text)
  with check (bucket_id = 'company-files' and (storage.foldername(name))[1] = 'company-' || public.auth_company_id()::text);
drop policy if exists "Company files isolation delete" on storage.objects;
create policy "Company files isolation delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-files' and (storage.foldername(name))[1] = 'company-' || public.auth_company_id()::text);

-- The 020 catch-all authenticated storage policies would defeat per-company
-- isolation on the new bucket (permissive policies OR together). Re-scope them
-- to every bucket EXCEPT company-files.
drop policy if exists "Authenticated storage read" on storage.objects;
create policy "Authenticated storage read" on storage.objects
  for select to authenticated using (bucket_id <> 'company-files');
drop policy if exists "Authenticated storage insert" on storage.objects;
create policy "Authenticated storage insert" on storage.objects
  for insert to authenticated with check (bucket_id <> 'company-files');
drop policy if exists "Authenticated storage update" on storage.objects;
create policy "Authenticated storage update" on storage.objects
  for update to authenticated using (bucket_id <> 'company-files') with check (bucket_id <> 'company-files');
drop policy if exists "Authenticated storage delete" on storage.objects;
create policy "Authenticated storage delete" on storage.objects
  for delete to authenticated using (bucket_id <> 'company-files');
