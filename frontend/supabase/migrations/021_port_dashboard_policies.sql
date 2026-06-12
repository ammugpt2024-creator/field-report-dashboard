-- Policies that existed on production via the dashboard but were never
-- captured in a migration (technician ownership of daily logs and child
-- records). Idempotent so it no-ops where they already exist.

drop policy if exists "Daily log child records follow parent read access" on public.daily_log_activities;
create policy "Daily log child records follow parent read access" on public.daily_log_activities for select to public using ((EXISTS ( SELECT 1
   FROM daily_logs
  WHERE ((daily_logs.id = daily_log_activities.daily_log_id) AND (daily_logs.technician_id = auth.uid())))));

drop policy if exists "Daily log child records follow parent write access" on public.daily_log_activities;
create policy "Daily log child records follow parent write access" on public.daily_log_activities for all to public using ((EXISTS ( SELECT 1
   FROM daily_logs
  WHERE ((daily_logs.id = daily_log_activities.daily_log_id) AND (daily_logs.technician_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM daily_logs
  WHERE ((daily_logs.id = daily_log_activities.daily_log_id) AND (daily_logs.technician_id = auth.uid())))));

drop policy if exists "Daily log signatures owner insert" on public.daily_log_signatures;
create policy "Daily log signatures owner insert" on public.daily_log_signatures for insert to authenticated with check ((signed_by = auth.uid()));

drop policy if exists "Daily log signatures owner read" on public.daily_log_signatures;
create policy "Daily log signatures owner read" on public.daily_log_signatures for select to authenticated using ((signed_by = auth.uid()));

drop policy if exists "Technicians can manage own daily logs" on public.daily_logs;
create policy "Technicians can manage own daily logs" on public.daily_logs for all to authenticated using ((technician_id = auth.uid())) with check ((technician_id = auth.uid()));

drop policy if exists "Technicians can manage own draft daily logs" on public.daily_logs;
create policy "Technicians can manage own draft daily logs" on public.daily_logs for all to public using ((technician_id = auth.uid())) with check ((technician_id = auth.uid()));

drop policy if exists "Technicians can read own daily logs" on public.daily_logs;
create policy "Technicians can read own daily logs" on public.daily_logs for select to public using ((technician_id = auth.uid()));
