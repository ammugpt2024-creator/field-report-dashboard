insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'daily-log-pdfs',
  'daily-log-pdfs',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.daily_logs
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists pdf_generation_status text not null default 'pending',
  add column if not exists pdf_generation_failure_reason text;

drop policy if exists "Daily log PDF storage owner read" on storage.objects;
create policy "Daily log PDF storage owner read"
on storage.objects
for select
to authenticated
using (bucket_id = 'daily-log-pdfs' and owner = auth.uid());

drop policy if exists "Daily log PDF storage owner insert" on storage.objects;
create policy "Daily log PDF storage owner insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'daily-log-pdfs' and owner = auth.uid());

drop policy if exists "Daily log PDF storage owner update" on storage.objects;
create policy "Daily log PDF storage owner update"
on storage.objects
for update
to authenticated
using (bucket_id = 'daily-log-pdfs' and owner = auth.uid())
with check (bucket_id = 'daily-log-pdfs' and owner = auth.uid());

drop policy if exists "Daily log PDF storage owner delete" on storage.objects;
create policy "Daily log PDF storage owner delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'daily-log-pdfs' and owner = auth.uid());
