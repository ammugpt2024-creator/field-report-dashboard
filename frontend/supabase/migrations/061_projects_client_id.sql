-- The missing half of 059: projects need the client they belong to.
--
-- 059 added client_cc_emails and its comment claimed projects.client_id had
-- existed since 023. It had not: the client_id in 023 belongs to invoices.
-- So the project form wrote a column that does not exist, and
-- getProjectClientRecipients() selected one too -- its error was caught and
-- turned into "no recipients", which is why approving a report never offered
-- to send it to anyone.
--
-- client_name (free text, since 001) stays as the name printed on reports.
-- client_id is the record that carries the contact address.

alter table public.projects
  add column if not exists client_id uuid references public.clients (id) on delete set null;

create index if not exists idx_projects_client on public.projects (client_id);

-- Link projects whose typed client name already matches a client record, so
-- existing work does not have to be re-pointed by hand. Only unambiguous
-- matches: one active client of that name in the same company.
update public.projects p
set client_id = m.id
from (
  select c.id, c.company_id, lower(trim(c.client_name)) as name
  from public.clients c
  where c.status = 'active'
  group by c.id, c.company_id, c.client_name
) m
where p.client_id is null
  and p.company_id = m.company_id
  and lower(trim(coalesce(p.client_name, ''))) = m.name
  and (
    select count(*) from public.clients c2
    where c2.company_id = p.company_id
      and c2.status = 'active'
      and lower(trim(c2.client_name)) = m.name
  ) = 1;
