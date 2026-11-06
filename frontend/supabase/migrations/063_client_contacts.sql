-- A client is an organisation, not one mailbox.
--
-- clients carries a single contact_name/contact_email, so a client with
-- several projects had to choose: the president, who belongs on the account,
-- or the project manager who actually wants the daily reports for their own
-- job. Reports then went to whoever won that argument.
--
-- Contacts become their own records, and each project names the one who
-- receives its reports. The client-level contact stays where it is, as the
-- account contact.

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  full_name text not null,
  email text,
  title text,                 -- "President", "Project Manager", "Resident Engineer"
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_contacts_email_format
    check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$')
);

create index if not exists idx_client_contacts_client on public.client_contacts (client_id);

-- Which contact receives this project's approved reports. Null falls back to
-- the client's own contact address, so nothing breaks before these are set.
alter table public.projects
  add column if not exists client_contact_id uuid references public.client_contacts (id) on delete set null;

-- Carry across the contact each client already has, so existing clients
-- arrive with their account contact already listed.
insert into public.client_contacts (company_id, client_id, full_name, email, title)
select c.company_id, c.id,
       coalesce(nullif(trim(c.contact_name), ''), c.client_name),
       nullif(trim(c.contact_email), ''),
       'Account contact'
from public.clients c
where nullif(trim(c.contact_email), '') is not null
  and not exists (
    select 1 from public.client_contacts cc
    where cc.client_id = c.id and lower(cc.email) = lower(trim(c.contact_email))
  );

alter table public.client_contacts enable row level security;

drop policy if exists "Company members read client contacts" on public.client_contacts;
create policy "Company members read client contacts" on public.client_contacts
  for select to authenticated
  using (company_id = public.auth_company_id());

drop policy if exists "Admins manage client contacts" on public.client_contacts;
create policy "Admins manage client contacts" on public.client_contacts
  for all to authenticated
  using (
    public.is_platform_admin()
    or (company_id = public.auth_company_id()
        and public.has_company_role(array['company_admin', 'project_manager']))
  )
  with check (
    public.is_platform_admin()
    or (company_id = public.auth_company_id()
        and public.has_company_role(array['company_admin', 'project_manager']))
  );

-- A project may only point at a contact of its own client, in its own
-- company. Picking from a dropdown makes that true; this keeps it true.
create or replace function public.enforce_project_client_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_client uuid;
  contact_company uuid;
begin
  if new.client_contact_id is null then
    return new;
  end if;
  select client_id, company_id into contact_client, contact_company
  from public.client_contacts where id = new.client_contact_id;
  if contact_client is null then
    raise exception 'that contact no longer exists';
  end if;
  if contact_company is distinct from new.company_id then
    raise exception 'that contact belongs to another company';
  end if;
  if new.client_id is not null and contact_client is distinct from new.client_id then
    raise exception 'that contact belongs to a different client';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_validate_client_contact on public.projects;
create trigger projects_validate_client_contact
before insert or update of client_contact_id, client_id on public.projects
for each row execute function public.enforce_project_client_contact();
