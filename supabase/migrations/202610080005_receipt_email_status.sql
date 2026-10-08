alter table public.agreement_acceptances
  add column if not exists receipt_email_status text not null default 'pending'
  check (receipt_email_status in ('pending', 'sending', 'sent', 'failed'));

alter table public.agreement_acceptances
  add column if not exists receipt_email_updated_at timestamptz;
