-- Role templates + per-project, per-module permissions.
--
-- Modules: daily_logs, timesheets, field_test_reports, lab_reports
-- Levels:  none, view, create_edit, approve, manage
--
-- A company defines reusable role templates (roles.permissions = module→level).
-- When a person is assigned to a project, the chosen template pre-fills
-- project_assignments.permissions, which the admin can then override per module
-- for that project. Enforcement reads project_assignments.permissions.

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  name text not null,
  description text default '',
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

alter table public.project_assignments
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- RLS: company members read their roles; only company admins manage them.
alter table public.roles enable row level security;
drop policy if exists "Company members read roles" on public.roles;
create policy "Company members read roles" on public.roles
  for select to authenticated
  using (company_id = public.auth_company_id() or public.is_platform_admin());
drop policy if exists "Company admins manage roles" on public.roles;
create policy "Company admins manage roles" on public.roles
  for all to authenticated
  using (company_id = public.auth_company_id() and public.has_company_role(array['company_admin']))
  with check (company_id = public.auth_company_id() and public.has_company_role(array['company_admin']));

-- Seed sensible default templates for every existing company.
insert into public.roles (company_id, name, description, permissions, is_system)
select c.id, t.name, t.description, t.permissions::jsonb, true
from public.companies c
cross join (values
  ('Field technician', 'Creates daily logs, timesheets, and field test reports',
    '{"daily_logs":"create_edit","timesheets":"create_edit","field_test_reports":"create_edit","lab_reports":"none"}'),
  ('Inspector', 'Inspects and documents field conditions',
    '{"daily_logs":"view","timesheets":"none","field_test_reports":"create_edit","lab_reports":"view"}'),
  ('Lab technician', 'Creates and manages lab reports',
    '{"daily_logs":"none","timesheets":"create_edit","field_test_reports":"view","lab_reports":"create_edit"}'),
  ('Project manager', 'Full access across project modules',
    '{"daily_logs":"manage","timesheets":"manage","field_test_reports":"manage","lab_reports":"manage"}'),
  ('Viewer', 'Read-only access to project modules',
    '{"daily_logs":"view","timesheets":"view","field_test_reports":"view","lab_reports":"view"}')
) as t(name, description, permissions)
on conflict (company_id, name) do nothing;

-- Backfill existing assignments' module permissions from their old single
-- access_level, so nothing loses access on upgrade.
update public.project_assignments pa
set permissions = jsonb_build_object(
  'daily_logs', x.lvl, 'timesheets', x.lvl, 'field_test_reports', x.lvl, 'lab_reports', x.lvl)
from (
  select id, case access_level
    when 'full' then 'manage'
    when 'review_approve' then 'approve'
    when 'view_only' then 'view'
    else 'create_edit' end as lvl
  from public.project_assignments
) x
where x.id = pa.id and (pa.permissions is null or pa.permissions = '{}'::jsonb);
