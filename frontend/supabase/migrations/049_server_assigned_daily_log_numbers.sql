-- Daily Field Report numbers are assigned by the database.
--
-- They used to come from a counter in each browser's localStorage
-- (dailyLogService getNextDfrNumber), handed out when a draft was created.
-- Every device therefore kept its own sequence: two technicians on one
-- project both issued PRDFR1, PRDFR2, ...; clearing browser data, a new
-- laptop or an incognito window restarted at 1; and one person on a phone
-- and a laptop produced two interleaved runs. DFR numbers are what gets cited
-- in disputes and audits, so they need to be unique per project.
--
-- Now a per-project counter, incremented inside the same statement that
-- submits the log, hands out the next number. Drafts carry none until they
-- are submitted. Numbers already issued are kept exactly as they are.

alter table public.daily_logs add column if not exists dfr_number text;

create table if not exists public.daily_log_counters (
  project_id bigint primary key,
  last_number integer not null default 0
);
-- Only the SECURITY DEFINER trigger below touches this table.
alter table public.daily_log_counters enable row level security;

-- 1. Keep every number already issued. Submitted logs carry theirs in the
--    payload (logNumber / dfrNumber) in the "<initials>DFR<n>" form.
update public.daily_logs dl
set dfr_number = coalesce(nullif(dl.payload ->> 'logNumber', ''), nullif(dl.payload ->> 'dfrNumber', ''))
where dl.dfr_number is null
  and coalesce(dl.status, '') not in ('', 'draft', 'active')
  and coalesce(nullif(dl.payload ->> 'logNumber', ''), nullif(dl.payload ->> 'dfrNumber', '')) ~ 'DFR[0-9]+$';

-- 2. Start each project's counter after the highest number it has issued, so
--    a new number can never repeat an old one.
insert into public.daily_log_counters (project_id, last_number)
select project_id, max((substring(dfr_number from 'DFR([0-9]+)$'))::integer)
from public.daily_logs
where project_id is not null and dfr_number ~ 'DFR[0-9]+$'
group by project_id
on conflict (project_id) do update
  set last_number = greatest(public.daily_log_counters.last_number, excluded.last_number);

-- 3. The assignment itself.
create or replace function public.assign_daily_log_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
  initials text;
begin
  -- An issued number never changes, whatever a client sends back.
  if tg_op = 'UPDATE' and old.dfr_number is not null then
    new.dfr_number := old.dfr_number;
  end if;

  if new.dfr_number is null
     and coalesce(new.status, '') not in ('', 'draft', 'active')
     and new.project_id is not null then
    -- Row-locked upsert: concurrent submissions on one project serialize
    -- here, so no two can receive the same number.
    insert into public.daily_log_counters (project_id, last_number)
    values (new.project_id, 1)
    on conflict (project_id) do update
      set last_number = public.daily_log_counters.last_number + 1
    returning last_number into next_number;

    -- Same initials rule the client used: first letter of each word, max 6.
    select left(upper(coalesce(string_agg(left(t.word, 1), '' order by t.ord), '')), 6)
      into initials
      from public.projects p,
           regexp_split_to_table(trim(coalesce(p.project_name, '')), '\s+') with ordinality as t(word, ord)
     where p.id = new.project_id and t.word <> '';

    new.dfr_number := coalesce(initials, '') || 'DFR' || next_number;
  end if;

  -- Every screen and the PDF read the number out of the payload, and every
  -- later write re-sends a payload built from someone's local copy. Stamp the
  -- official number on each write so a stale copy cannot put an old one back.
  if new.dfr_number is not null then
    new.payload := jsonb_set(
      jsonb_set(coalesce(new.payload, '{}'::jsonb), '{logNumber}', to_jsonb(new.dfr_number)),
      '{dfrNumber}', to_jsonb(new.dfr_number)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists daily_logs_assign_number on public.daily_logs;
create trigger daily_logs_assign_number
before insert or update on public.daily_logs
for each row execute function public.assign_daily_log_number();

-- 4. Submitted logs that never got a recognisable number get one now, in the
--    order they were submitted.
do $$
declare
  r record;
begin
  for r in
    select id from public.daily_logs
    where dfr_number is null
      and coalesce(status, '') not in ('', 'draft', 'active')
      and project_id is not null
    order by submitted_at nulls last, id
  loop
    update public.daily_logs set updated_at = updated_at where id = r.id;
  end loop;
end $$;

-- 5. Enforce uniqueness from here on. Numbers issued by the old per-browser
--    counters may already collide; those are left as issued rather than
--    silently renumbered, so the index is only created when there are none.
do $$
begin
  if exists (
    select 1 from public.daily_logs
    where dfr_number is not null
    group by project_id, dfr_number
    having count(*) > 1
  ) then
    raise notice 'Duplicate DFR numbers already exist from the old per-browser counters; unique index not created. List them with: select project_id, dfr_number, count(*) from daily_logs where dfr_number is not null group by 1, 2 having count(*) > 1;';
  else
    create unique index if not exists daily_logs_project_dfr_number_key
      on public.daily_logs (project_id, dfr_number)
      where dfr_number is not null;
  end if;
end $$;
