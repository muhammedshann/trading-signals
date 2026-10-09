alter table public.plans
  add column if not exists original_price_inr integer;

alter table public.plans
  drop constraint if exists plans_original_price_inr_check;

alter table public.plans
  add constraint plans_original_price_inr_check
  check (original_price_inr is null or original_price_inr > price_inr);
