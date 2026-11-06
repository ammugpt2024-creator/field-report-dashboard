-- Who outside the company receives a project's approved reports.
--
-- Approved daily logs reached the technician and nobody else: no project knew
-- its client. (This file originally claimed projects.client_id had existed
-- since 023 -- it had not; that column belongs to invoices. Migration 061
-- adds it.)
--
-- client_cc_emails holds the extra addresses for that project (an owner's
-- rep, a GC inbox) alongside the client record's own contact email.

alter table public.projects
  add column if not exists client_cc_emails text[] not null default '{}';

-- Addresses must look like addresses, and the list stays short enough to
-- read on the confirmation prompt before a manager sends.
create or replace function public.validate_project_client_cc()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  address text;
begin
  if new.client_cc_emails is null then
    new.client_cc_emails := '{}';
    return new;
  end if;
  if array_length(new.client_cc_emails, 1) > 10 then
    raise exception 'A project can copy at most 10 extra addresses on client reports.';
  end if;
  foreach address in array new.client_cc_emails loop
    if address !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
      raise exception '% is not a valid email address.', address;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists projects_validate_client_cc on public.projects;
create trigger projects_validate_client_cc
before insert or update of client_cc_emails on public.projects
for each row execute function public.validate_project_client_cc();
