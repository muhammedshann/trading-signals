insert into public.plans (id, name, price_inr, duration_days, active)
values ('quarterly', '3 Months', 6999, 90, true)
on conflict (id) do nothing;
