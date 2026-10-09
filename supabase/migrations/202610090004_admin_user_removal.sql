alter table public.profiles
  add column if not exists removed_at timestamptz;

create index if not exists profiles_removed_at_idx
  on public.profiles (removed_at);
