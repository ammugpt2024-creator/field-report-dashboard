-- Company-defined roles.
--
-- Until now a person's company role was one of seven hardcoded values, so a
-- company could not name a role after its own org chart ("Lab Manager",
-- "Regional QC Lead"). Making that column free-form is not an option: RLS
-- policies across 023/033/038 test it directly via has_company_role(), and an
-- unrecognised value would silently strand people or, worse, be treated as
-- unprivileged when it should not be.
--
-- So a role now carries a base_role: the built-in it behaves like. Companies
-- own the name and the module permissions; authentication, routing and RLS
-- keep reading company_users.role, which only ever holds one of the seven.

alter table public.roles
  add column if not exists base_role text not null default 'viewer';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'roles_base_role_check'
  ) then
    alter table public.roles add constraint roles_base_role_check
      check (base_role in (
        'company_admin', 'project_manager', 'deputy_project_manager',
        'technician', 'inspector', 'lab_technician', 'viewer'
      ));
  end if;
end $$;

-- The templates seeded by 033 predate base_role; map them to their built-in.
update public.roles set base_role = 'technician'      where is_system and lower(name) = 'field technician';
update public.roles set base_role = 'inspector'       where is_system and lower(name) = 'inspector';
update public.roles set base_role = 'lab_technician'  where is_system and lower(name) = 'lab technician';
update public.roles set base_role = 'project_manager' where is_system and lower(name) = 'project manager';
update public.roles set base_role = 'viewer'          where is_system and lower(name) = 'viewer';

-- 033 seeded no template for company_admin or deputy_project_manager. Without
-- them those two built-ins would be unreachable once the employee picker reads
-- this table, so every company needs one of each.
insert into public.roles (company_id, name, description, permissions, is_system, base_role)
select c.id, t.name, t.description, t.permissions::jsonb, true, t.base_role
from public.companies c
cross join (values
  ('Company Admin', 'Full control of the company, its people, and every report',
    '{"daily_logs":"manage","timesheets":"manage","field_test_reports":"manage","lab_reports":"manage"}',
    'company_admin'),
  ('Deputy Project Manager', 'Supports project managers and approves work on assigned projects',
    '{"daily_logs":"approve","timesheets":"approve","field_test_reports":"approve","lab_reports":"approve"}',
    'deputy_project_manager')
) as t(name, description, permissions, base_role)
on conflict (company_id, name) do nothing;

-- Which company-defined role a person holds. company_users.role continues to
-- hold the base type and stays the only thing RLS reads.
alter table public.company_users
  add column if not exists role_id uuid references public.roles (id) on delete set null;

-- Point existing people at the system role matching the built-in they already
-- have, so nobody shows up roleless in the picker after this migration.
update public.company_users cu
set role_id = pick.id
from (
  select distinct on (company_id, base_role) id, company_id, base_role
  from public.roles
  where is_system
  order by company_id, base_role, name
) as pick
where pick.company_id = cu.company_id
  and pick.base_role = cu.role
  and cu.role_id is null;

-- Keep company_users.role in lockstep with the chosen role's base_role. Doing
-- this in the database rather than the client means no caller can put the
-- security-facing column out of step with the role it is meant to reflect.
create or replace function public.company_user_role_from_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_id is not null then
    select base_role into new.role from public.roles where id = new.role_id;
  end if;
  return new;
end;
$$;

drop trigger if exists company_users_sync_base_role on public.company_users;
create trigger company_users_sync_base_role
before insert or update on public.company_users
for each row execute function public.company_user_role_from_base();

-- Re-pointing a role at a different built-in has to follow through to everyone
-- holding it, or their access silently diverges from what the role now says.
create or replace function public.roles_propagate_base_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_role is distinct from old.base_role then
    update public.company_users
       set role = new.base_role, updated_at = now()
     where role_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists roles_sync_members on public.roles;
create trigger roles_sync_members
after update on public.roles
for each row execute function public.roles_propagate_base_role();
