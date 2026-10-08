alter table public.telegram_members add column if not exists verified_at timestamptz;
create unique index if not exists telegram_members_one_verified_account
  on public.telegram_members(user_id) where verified_at is not null;

create table public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index telegram_link_codes_expiry on public.telegram_link_codes(expires_at);
create index telegram_link_codes_user_created on public.telegram_link_codes(user_id, created_at desc);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;
grant all on public.telegram_link_codes to service_role;
