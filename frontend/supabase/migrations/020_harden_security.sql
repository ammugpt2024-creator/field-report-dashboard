-- Security hardening: enable RLS everywhere and remove anonymous access,
-- while keeping behavior identical for signed-in users (every app query runs
-- post-login as the authenticated role; the edge function uses the service
-- role, which bypasses RLS).

-- ── Tables that had RLS disabled ────────────────────────────────────────────

-- profiles: names/emails/roles were publicly readable with the anon key.
alter table public.profiles enable row level security;
drop policy if exists "Profiles readable by authenticated" on public.profiles;
create policy "Profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
drop policy if exists "Profiles self insert" on public.profiles;
create policy "Profiles self insert"
  on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "Profiles self update" on public.profiles;
create policy "Profiles self update"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- projects: read-only from the app (no client writes exist).
alter table public.projects enable row level security;
drop policy if exists "Projects readable by authenticated" on public.projects;
create policy "Projects readable by authenticated"
  on public.projects for select to authenticated using (true);

-- Concrete report flow: full CRUD from the app by technicians and reviewers
-- (cross-user QC review updates), so the baseline is authenticated-wide.
do $$
declare t text;
begin
  foreach t in array array[
    'concrete_test_logs',
    'concrete_specifications',
    'concrete_delivery_testing_records',
    'concrete_attachments',
    'report_review_history'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Authenticated full access" on public.%I', t);
    execute format(
      'create policy "Authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;

-- notification_queue: the app inserts queue rows after submit/approve; the
-- edge function reads/updates them with the service role.
alter table public.notification_queue enable row level security;
drop policy if exists "Authenticated queue insert" on public.notification_queue;
create policy "Authenticated queue insert"
  on public.notification_queue for insert to authenticated with check (true);
drop policy if exists "Authenticated queue read" on public.notification_queue;
create policy "Authenticated queue read"
  on public.notification_queue for select to authenticated using (true);
drop policy if exists "Authenticated queue update" on public.notification_queue;
create policy "Authenticated queue update"
  on public.notification_queue for update to authenticated using (true) with check (true);

-- ── Storage ─────────────────────────────────────────────────────────────────

-- The "Allow uploads" policies granted SELECT/INSERT/UPDATE on every object in
-- every bucket to the public role (anonymous included). Replace them with
-- authenticated-only equivalents so signed-in flows keep working unchanged.
drop policy if exists "Allow uploads i3p58f_0" on storage.objects;
drop policy if exists "Allow uploads i3p58f_1" on storage.objects;
drop policy if exists "Allow uploads i3p58f_2" on storage.objects;

drop policy if exists "Authenticated storage read" on storage.objects;
create policy "Authenticated storage read"
  on storage.objects for select to authenticated using (true);
drop policy if exists "Authenticated storage insert" on storage.objects;
create policy "Authenticated storage insert"
  on storage.objects for insert to authenticated with check (true);
drop policy if exists "Authenticated storage update" on storage.objects;
create policy "Authenticated storage update"
  on storage.objects for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated storage delete" on storage.objects;
create policy "Authenticated storage delete"
  on storage.objects for delete to authenticated using (true);

-- Daily log attachment policies included the anon role — restrict to
-- authenticated. (Signed URLs in emails keep working: their tokens are
-- validated by the storage service, not by RLS.)
alter policy "Daily log attachment storage owner read" on storage.objects to authenticated;
alter policy "Daily log attachment storage owner insert" on storage.objects to authenticated;
alter policy "Daily log attachment storage owner update" on storage.objects to authenticated;
alter policy "Daily log attachment storage owner delete" on storage.objects to authenticated;

-- The only public bucket; its sole consumer is an unused component, and every
-- live flow serves files through signed URLs on private buckets.
update storage.buckets set public = false where id = 'reports';
