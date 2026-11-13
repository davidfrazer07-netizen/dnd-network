-- DND Network, update 2 — run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds: Aadhaar number + front/back photos, projects per state (admin-managed),
-- worker -> project link, and hides the three states you are not working in yet.

-- 1. only OD, TN, KA are live for now (flip any back to true to bring a state back)
alter table public.cities add column if not exists active boolean not null default true;
update public.cities set active = false where code in ('KL', 'MH', 'TS');

-- 2. projects: one list per state. Everyone in that state can read; only admins can change.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  city_code text not null references public.cities(code),
  name text not null,
  created_at timestamptz not null default now(),
  unique (city_code, name)
);
alter table public.projects enable row level security;

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (public.is_admin() or city_code = public.my_city());

drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_write on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3. workers: "other number" becomes the Aadhaar number, plus photos and project
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'workers' and column_name = 'other_number') then
    alter table public.workers rename column other_number to aadhaar_number;
  end if;
end $$;
alter table public.workers add column if not exists aadhaar_number text;
alter table public.workers add column if not exists aadhaar_front text;   -- storage path
alter table public.workers add column if not exists aadhaar_back text;    -- storage path
alter table public.workers add column if not exists project_id uuid references public.projects(id) on delete set null;

-- contractors may only pick a project from their own state
create or replace function public.check_worker_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is not null
     and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id)
     and not public.is_admin() then
    if not exists (select 1 from projects where id = new.project_id and city_code = public.my_city()) then
      raise exception 'You can only pick projects from your own state';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_check_project on public.workers;
create trigger trg_check_project before insert or update on public.workers
  for each row execute function public.check_worker_project();

-- 4. private bucket for Aadhaar photos; files live under <STATE>/<worker id>/...
insert into storage.buckets (id, name, public) values ('aadhaar', 'aadhaar', false)
on conflict (id) do nothing;

drop policy if exists aadhaar_read on storage.objects;
create policy aadhaar_read on storage.objects for select to authenticated
  using (bucket_id = 'aadhaar' and (public.is_admin() or (storage.foldername(name))[1] = public.my_city()));

drop policy if exists aadhaar_insert on storage.objects;
create policy aadhaar_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'aadhaar' and (public.is_admin() or (storage.foldername(name))[1] = public.my_city()));

drop policy if exists aadhaar_update on storage.objects;
create policy aadhaar_update on storage.objects for update to authenticated
  using (bucket_id = 'aadhaar' and (public.is_admin() or (storage.foldername(name))[1] = public.my_city()));

drop policy if exists aadhaar_delete on storage.objects;
create policy aadhaar_delete on storage.objects for delete to authenticated
  using (bucket_id = 'aadhaar' and (public.is_admin() or (storage.foldername(name))[1] = public.my_city()));
