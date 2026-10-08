alter table public.telegram_link_codes
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_telegram_user_id text,
  add column if not exists claimed_username text,
  add column if not exists claimed_display_name text;

create index if not exists telegram_link_codes_pending_claim
  on public.telegram_link_codes(user_id, claimed_at desc)
  where claimed_at is not null and used_at is null;

alter table public.telegram_members
  add column if not exists display_name text;
