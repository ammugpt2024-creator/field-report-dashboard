-- Keep profiles.role in step with company_users.role.
--
-- Two columns describe what someone is: company_users.role (the SaaS
-- membership) and profiles.role (the older per-user role the app still routes
-- on). 027 writes profiles.role once, when an invite is claimed, and even then
-- only via coalesce(profiles.role, excluded.role) so it never overwrites an
-- existing value. Nothing has ever updated it afterwards.
--
-- So changing somebody's company role moved company_users.role and left
-- profiles.role behind. getRoleHomeRoute() reads profiles.role, so demoting a
-- company admin to field technician left them still landing on /company-admin
-- with the full admin sidebar. This predates company-defined roles; the role
-- picker simply made it easy to hit.

create or replace function public.legacy_role_for(base text)
returns text
language sql
immutable
as $$
  select case base
    when 'company_admin' then 'company_admin'
    when 'project_manager' then 'project_manager'
    when 'deputy_project_manager' then 'project_manager'
    when 'technician' then 'technician'
    when 'lab_technician' then 'technician'
    when 'inspector' then 'qc'
    else 'viewer'
  end;
$$;

create or replace function public.sync_profile_role_from_company_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null
     and (tg_op = 'INSERT' or new.role is distinct from old.role) then
    update public.profiles
       set role = public.legacy_role_for(new.role),
           updated_at = now()
     where id = new.user_id;
  end if;
  return new;
end;
$$;

-- AFTER, so it sees the role that company_users_sync_base_role derived from
-- the chosen role's base_role rather than whatever the client sent.
drop trigger if exists company_users_sync_profile_role on public.company_users;
create trigger company_users_sync_profile_role
after insert or update on public.company_users
for each row execute function public.sync_profile_role_from_company_user();

-- Repair everyone whose profile drifted from their membership.
update public.profiles p
set role = public.legacy_role_for(cu.role),
    updated_at = now()
from public.company_users cu
where cu.user_id = p.id
  and cu.status = 'active'
  and p.role is distinct from public.legacy_role_for(cu.role);
