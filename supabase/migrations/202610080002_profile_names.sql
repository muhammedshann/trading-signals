alter table public.profiles add column if not exists full_name text;

insert into public.profiles (id, email, full_name)
select
  u.id,
  coalesce(u.email, ''),
  nullif(trim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

update public.profiles p
set full_name = nullif(trim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
where p.id = u.id and p.full_name is null;
