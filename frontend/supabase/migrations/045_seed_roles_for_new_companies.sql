-- Every company gets the default roles, not just the ones that existed in 033.
--
-- 033 seeded role templates with a one-shot INSERT ... SELECT over the
-- companies table, and nothing has seeded them since — createCompany() creates
-- company_settings and company_subscriptions but no roles. So every company
-- onboarded after 033 ran has an empty Roles screen and an empty role picker,
-- which is how DULLES ended up able to assign only the two roles 044 added.
--
-- Seeding moves into a function fired by a trigger on companies, so it happens
-- for every company however it is created, and the backfill below repairs the
-- ones already onboarded.

create or replace function public.seed_default_company_roles(target_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Matched on base_role rather than name: 033 wrote "Field technician" and
  -- 044 wrote "Company Admin", so a name-based guard would duplicate roles for
  -- companies that already have one of each built-in under a different casing.
  insert into public.roles (company_id, name, description, permissions, is_system, base_role)
  select target_company, t.name, t.description, t.permissions::jsonb, true, t.base_role
  from (values
    ('Company Admin', 'Full control of the company, its people, and every report',
      '{"daily_logs":"manage","timesheets":"manage","field_test_reports":"manage","lab_reports":"manage"}',
      'company_admin'),
    ('Project Manager', 'Runs projects and approves everyone''s work',
      '{"daily_logs":"manage","timesheets":"manage","field_test_reports":"manage","lab_reports":"manage"}',
      'project_manager'),
    ('Deputy Project Manager', 'Supports project managers and approves work on assigned projects',
      '{"daily_logs":"approve","timesheets":"approve","field_test_reports":"approve","lab_reports":"approve"}',
      'deputy_project_manager'),
    ('Field Technician', 'Creates daily logs, timesheets, and field test reports',
      '{"daily_logs":"create_edit","timesheets":"create_edit","field_test_reports":"create_edit","lab_reports":"none"}',
      'technician'),
    ('Inspector', 'Inspects and documents field conditions',
      '{"daily_logs":"view","timesheets":"none","field_test_reports":"create_edit","lab_reports":"view"}',
      'inspector'),
    ('Lab Technician', 'Creates and manages lab reports',
      '{"daily_logs":"none","timesheets":"create_edit","field_test_reports":"view","lab_reports":"create_edit"}',
      'lab_technician'),
    ('Viewer', 'Read-only access across the tools',
      '{"daily_logs":"view","timesheets":"view","field_test_reports":"view","lab_reports":"view"}',
      'viewer')
  ) as t(name, description, permissions, base_role)
  where not exists (
    select 1 from public.roles r
    where r.company_id = target_company
      and r.is_system
      and r.base_role = t.base_role
  )
  on conflict (company_id, name) do nothing;
end;
$$;

create or replace function public.seed_roles_on_company_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_company_roles(new.id);
  return new;
end;
$$;

drop trigger if exists companies_seed_default_roles on public.companies;
create trigger companies_seed_default_roles
after insert on public.companies
for each row execute function public.seed_roles_on_company_insert();

-- Repair every company onboarded since 033.
do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.seed_default_company_roles(c.id);
  end loop;
end $$;
