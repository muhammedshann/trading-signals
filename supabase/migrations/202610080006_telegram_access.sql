create table public.telegram_invites (
  id uuid primary key default gen_random_uuid(),
  invite_hash text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index telegram_invites_user_created on public.telegram_invites(user_id, created_at desc);
create index telegram_invites_expiry on public.telegram_invites(expires_at);

create table public.telegram_members (
  telegram_user_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text,
  joined_at timestamptz not null default now(),
  kicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index telegram_members_user on public.telegram_members(user_id);
create index telegram_members_active on public.telegram_members(kicked_at) where kicked_at is null;

alter table public.telegram_invites enable row level security;
alter table public.telegram_members enable row level security;
revoke all on public.telegram_invites, public.telegram_members from anon, authenticated;
grant all on public.telegram_invites, public.telegram_members to service_role;
