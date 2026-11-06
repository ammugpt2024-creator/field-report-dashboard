-- The account contact deserves a title too.
--
-- 063 gave every named contact a title ("Project Manager", "Resident
-- Engineer"), but the client's own account contact had only a name, so the
-- president appeared on screen with no indication of who they are.

alter table public.clients
  add column if not exists contact_title text;

-- The contact rows carried across by 063 were all labelled "Account
-- contact". Where the client now carries a real title, use it.
update public.client_contacts cc
set title = c.contact_title
from public.clients c
where cc.client_id = c.id
  and cc.title = 'Account contact'
  and nullif(trim(coalesce(c.contact_title, '')), '') is not null;
