insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'timesheet-pdfs',
  'timesheet-pdfs',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'time_cards'
  ) then
    alter table public.time_cards
      add column if not exists pdf_storage_path text,
      add column if not exists pdf_generated_at timestamptz,
      add column if not exists pdf_generation_status text not null default 'pending',
      add column if not exists pdf_generation_failure_reason text,
      add column if not exists time_in time,
      add column if not exists time_out time,
      add column if not exists break_minutes integer default 0,
      add column if not exists total_hours numeric(8, 2),
      add column if not exists is_overnight_shift boolean not null default false;
  end if;
end $$;

drop policy if exists "Timesheet PDF storage owner read" on storage.objects;
create policy "Timesheet PDF storage owner read"
on storage.objects
for select
to authenticated
using (bucket_id = 'timesheet-pdfs' and owner = auth.uid());

drop policy if exists "Timesheet PDF storage owner insert" on storage.objects;
create policy "Timesheet PDF storage owner insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'timesheet-pdfs' and owner = auth.uid());

drop policy if exists "Timesheet PDF storage owner update" on storage.objects;
create policy "Timesheet PDF storage owner update"
on storage.objects
for update
to authenticated
using (bucket_id = 'timesheet-pdfs' and owner = auth.uid())
with check (bucket_id = 'timesheet-pdfs' and owner = auth.uid());

drop policy if exists "Timesheet PDF storage owner delete" on storage.objects;
create policy "Timesheet PDF storage owner delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'timesheet-pdfs' and owner = auth.uid());
