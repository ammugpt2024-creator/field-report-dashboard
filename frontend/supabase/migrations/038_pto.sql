-- Paid Time Off (PTO) module.
--
-- pto_policies: company-wide annual allotment per leave type (admin-editable).
-- pto_requests: an employee's time-off request; approved by a company admin.
-- Balances are computed (allotment − approved − pending), not stored as a ledger.

create table if not exists public.pto_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  pto_type text not null check (pto_type in ('vacation', 'sick', 'personal', 'unpaid')),
  annual_hours integer not null default 0,
  is_paid boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, pto_type)
);

create table if not exists public.pto_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pto_type text not null check (pto_type in ('vacation', 'sick', 'personal', 'unpaid')),
  start_date date not null,
  end_date date not null,
  hours numeric not null default 0,
  reason text default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  reviewer_comment text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pto_requests_company_status on public.pto_requests (company_id, status);
create index if not exists idx_pto_requests_user on public.pto_requests (user_id);

-- RLS: everyone reads their company's policies; only admins edit them.
alter table public.pto_policies enable row level security;
drop policy if exists "Members read pto policies" on public.pto_policies;
create policy "Members read pto policies" on public.pto_policies
  for select to authenticated using (company_id = public.auth_company_id());
drop policy if exists "Admins manage pto policies" on public.pto_policies;
create policy "Admins manage pto policies" on public.pto_policies
  for all to authenticated
  using (company_id = public.auth_company_id() and public.has_company_role(array['company_admin']))
  with check (company_id = public.auth_company_id() and public.has_company_role(array['company_admin']));

-- RLS: an employee manages their own requests; company admins manage all
-- requests in the company (the approval queue).
alter table public.pto_requests enable row level security;
drop policy if exists "Members manage own pto" on public.pto_requests;
create policy "Members manage own pto" on public.pto_requests
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Admins manage company pto" on public.pto_requests;
create policy "Admins manage company pto" on public.pto_requests
  for all to authenticated
  using (company_id = public.auth_company_id() and public.has_company_role(array['company_admin']))
  with check (company_id = public.auth_company_id() and public.has_company_role(array['company_admin']));

-- Seed sensible default policies for every existing company.
insert into public.pto_policies (company_id, pto_type, annual_hours, is_paid)
select c.id, t.pto_type, t.annual_hours, t.is_paid
from public.companies c
cross join (values
  ('vacation', 120, true),
  ('sick', 40, true),
  ('personal', 16, true),
  ('unpaid', 0, false)
) as t(pto_type, annual_hours, is_paid)
on conflict (company_id, pto_type) do nothing;
