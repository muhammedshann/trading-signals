alter table public.subscriptions
  add column if not exists expiry_warning_sent_at timestamptz,
  add column if not exists expired_email_sent_at timestamptz;

create index if not exists subscriptions_expiry_warning_idx
  on public.subscriptions (status, expires_at)
  where expiry_warning_sent_at is null;

create index if not exists subscriptions_expired_notice_idx
  on public.subscriptions (expires_at)
  where expired_email_sent_at is null;
