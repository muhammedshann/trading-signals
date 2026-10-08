create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('member','admin')),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.plans (
  id text primary key,
  name text not null,
  price_inr integer not null check (price_inr > 0),
  duration_days integer not null check (duration_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id text not null references public.plans(id),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  amount_inr integer not null check (amount_inr > 0),
  status text not null default 'created' check (status in ('created','paid','failed','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id text not null references public.plans(id),
  status text not null default 'active' check (status in ('active','expired','cancelled','suspended')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  razorpay_payment_id text not null unique,
  created_at timestamptz not null default now()
);

create index subscriptions_user_expiry on public.subscriptions(user_id, expires_at desc);
create index payments_user_created on public.payments(user_id, created_at desc);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id,email,full_name)
  values (new.id, coalesce(new.email,''), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;

create policy "Members read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Plans are visible" on public.plans for select to anon, authenticated using (active or (select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Members read own payments" on public.payments for select to authenticated using (user_id = (select auth.uid()));
create policy "Members read own subscriptions" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins read profiles" on public.profiles for select to authenticated using ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admins manage plans" on public.plans for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role') = 'admin') with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admins read all payments" on public.payments for select to authenticated using ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admins manage payments" on public.payments for update to authenticated using ((select auth.jwt()->'app_metadata'->>'role') = 'admin') with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admins read all subscriptions" on public.subscriptions for select to authenticated using ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admins manage subscriptions" on public.subscriptions for update to authenticated using ((select auth.jwt()->'app_metadata'->>'role') = 'admin') with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');

insert into public.plans(id,name,price_inr,duration_days) values
 ('monthly','Monthly membership',2499,30),
 ('annual','Annual membership',24990,365)
on conflict (id) do nothing;

grant usage on schema public to anon, authenticated;
grant select on public.plans to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.payments, public.subscriptions to authenticated;
grant update on public.payments, public.subscriptions to authenticated;
grant insert, update, delete on public.plans to authenticated;
