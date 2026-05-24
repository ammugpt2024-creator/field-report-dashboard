alter table public.concrete_test_logs
  add column if not exists qc_signature_url text,
  add column if not exists qc_signature_storage_path text;
