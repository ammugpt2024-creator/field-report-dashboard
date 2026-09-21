-- Where approved timesheets go for payroll, and how the pay periods fall.
--
-- payroll_email     the address that receives each approved timesheet, with
--                   its PDF attached. Usually outside the company roster (an
--                   accountant or a payroll bureau), which is why the send
--                   function has to know it: notifications are otherwise
--                   restricted to company members.
-- payroll_period_start_date
--                   any day a pay period began. Periods run every 14 days
--                   from it, so each approved timesheet can name the period
--                   it belongs to.

alter table public.company_settings
  add column if not exists payroll_email text,
  add column if not exists payroll_period_start_date date,
  add column if not exists payroll_period_days integer not null default 14;

-- Guard rails: a sensible cycle length, and an address that looks like one.
alter table public.company_settings drop constraint if exists company_settings_payroll_period_days_check;
alter table public.company_settings
  add constraint company_settings_payroll_period_days_check
  check (payroll_period_days in (7, 14, 15, 30));

alter table public.company_settings drop constraint if exists company_settings_payroll_email_check;
alter table public.company_settings
  add constraint company_settings_payroll_email_check
  check (payroll_email is null or payroll_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$');
