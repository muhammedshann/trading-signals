create table if not exists public.agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  email text not null,
  terms_version text not null,
  risk_disclosure_version text not null,
  privacy_policy_version text not null,
  refund_policy_version text not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  payment_id text,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  agreement_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.agreement_acceptances enable row level security;
revoke all on public.agreement_acceptances from anon, authenticated;

alter table public.payments
  add column if not exists agreement_id uuid unique references public.agreement_acceptances(id);

create index if not exists agreement_acceptances_user_accepted
  on public.agreement_acceptances(user_id, accepted_at desc);
