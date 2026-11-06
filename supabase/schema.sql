-- DND Network — run this once in Supabase: SQL Editor > New query > paste > Run.
-- Then run scripts/seed-users.mjs to create the 14 logins.

create table if not exists public.cities (
  code text primary key,           -- two letters, e.g. OD
  name text not null,
  sort int not null default 0
);

-- EDIT THESE SIX to your real cities / states before running.
insert into public.cities (code, name, sort) values
  ('OD', 'Odisha', 1),
  ('TN', 'Tamil Nadu', 2),
  ('KA', 'Karnataka', 3),
  ('KL', 'Kerala', 4),
  ('MH', 'Maharashtra', 5),
  ('TS', 'Telangana', 6)
on conflict (code) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  full_name text not null,
  role text not null check (role in ('admin', 'contractor')),
  city_code text references public.cities(code),
  slot int                          -- 1 or 2 (which contractor in the city)
);

create table if not exists public.city_counters (
  city_code text primary key references public.cities(code),
  last_serial int not null default 0
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  worker_code text unique not null,                      -- DND_OD_005 (auto)
  city_code text not null references public.cities(code), -- home city (never changes)
  contractor_id uuid not null references public.profiles(id),
  first_name text not null,
  last_name text not null,
  dob date not null,
  sex text not null check (sex in ('Male', 'Female', 'Other')),
  address text,
  phone text not null,
  other_number text,
  skill text not null,
  current_city text references public.cities(code),      -- where they work now
  current_task text,
  status text not null default 'Working' check (status in ('Working', 'Available', 'On leave')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- helpers (security definer so policies don't recurse into profiles)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_city() returns text
language sql stable security definer set search_path = public as $$
  select city_code from profiles where id = auth.uid() and role = 'contractor';
$$;

-- auto serial: DND_<CITY>_<001>; serials are never reused after a removal
create or replace function public.assign_worker_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into city_counters (city_code, last_serial) values (new.city_code, 1)
  on conflict (city_code) do update set last_serial = city_counters.last_serial + 1
  returning last_serial into n;
  new.worker_code := 'DND_' || new.city_code || '_' || lpad(n::text, 3, '0');
  return new;
end $$;

drop trigger if exists trg_assign_code on public.workers;
create trigger trg_assign_code before insert on public.workers
  for each row execute function public.assign_worker_code();

-- the ID and home city can never be edited
create or replace function public.lock_worker_identity() returns trigger
language plpgsql as $$
begin
  new.worker_code := old.worker_code;
  new.city_code := old.city_code;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_lock_identity on public.workers;
create trigger trg_lock_identity before update on public.workers
  for each row execute function public.lock_worker_identity();

-- Row level security: this is what actually enforces "own city only"
alter table public.cities enable row level security;
alter table public.profiles enable row level security;
alter table public.workers enable row level security;
alter table public.city_counters enable row level security;  -- no policies = no direct access

drop policy if exists cities_read on public.cities;
create policy cities_read on public.cities for select to authenticated using (true);

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or city_code = public.my_city());

drop policy if exists workers_read on public.workers;
create policy workers_read on public.workers for select to authenticated
  using (public.is_admin() or city_code = public.my_city());

drop policy if exists workers_insert on public.workers;
create policy workers_insert on public.workers for insert to authenticated
  with check (
    (public.is_admin() or city_code = public.my_city())
    and exists (select 1 from profiles p where p.id = contractor_id
                and p.role = 'contractor' and p.city_code = workers.city_code)
  );

drop policy if exists workers_update on public.workers;
create policy workers_update on public.workers for update to authenticated
  using (public.is_admin() or city_code = public.my_city())
  with check (public.is_admin() or city_code = public.my_city());

drop policy if exists workers_delete on public.workers;
create policy workers_delete on public.workers for delete to authenticated
  using (public.is_admin() or city_code = public.my_city());
