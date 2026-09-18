-- A time-off request cannot claim more hours than its dates contain.
--
-- The request form accepted any figure, so a one-day request was stored as
-- 48 h and counted against the employee's balance. The form now refuses it;
-- this makes the database refuse it too, whatever client sends the row.
--
-- NOT VALID: existing rows are left as filed (the 48 h request is one of
-- them) and only new or edited rows are checked. Correct or cancel those
-- rows, then run
--   alter table public.pto_requests validate constraint pto_requests_hours_within_dates;

alter table public.pto_requests drop constraint if exists pto_requests_hours_within_dates;
alter table public.pto_requests
  add constraint pto_requests_hours_within_dates
  check (
    hours > 0
    and end_date >= start_date
    and hours <= ((end_date - start_date) + 1) * 24
  ) not valid;
