create table if not exists public.email_otp_challenges (
  email text primary key,
  purpose text not null check (purpose in ('signup', 'login')),
  full_name text,
  code_hash text not null,
  link_hash text not null,
  expires_at timestamptz not null,
  sent_window_started_at timestamptz not null default now(),
  sent_count integer not null default 1 check (sent_count > 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  link_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_otp_challenges enable row level security;
revoke all on public.email_otp_challenges from anon, authenticated;

create index if not exists email_otp_challenges_expiry on public.email_otp_challenges(expires_at);
