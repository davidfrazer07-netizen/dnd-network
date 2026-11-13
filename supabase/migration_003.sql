-- DND Network, update 3 — run once in Supabase: SQL Editor > New query > paste > Run.
-- Adds: worker deployment history (automatic) and admins renaming contractors.

-- 1. admins (Dhanush, Derain) can rename contractors
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2. deployment history: one row per stretch a worker spends in one state on one project
create table if not exists public.worker_history (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  state_code text references public.cities(code),
  project_id uuid references public.projects(id) on delete set null,
  project_name text,                      -- snapshot, survives project deletion
  started_at timestamptz not null default now(),
  ended_at timestamptz                    -- null = current
);
create index if not exists worker_history_worker on public.worker_history (worker_id, started_at);
alter table public.worker_history enable row level security;

drop policy if exists history_read on public.worker_history;
create policy history_read on public.worker_history for select to authenticated
  using (exists (select 1 from public.workers w where w.id = worker_id
                 and (public.is_admin() or w.city_code = public.my_city())));
-- no write policies: only the trigger below writes history

-- 3. keep it up to date automatically whenever a worker is added or their state/project changes
create or replace function public.log_worker_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if tg_op = 'UPDATE' and new.current_city is not distinct from old.current_city
     and new.project_id is not distinct from old.project_id then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    update worker_history set ended_at = now() where worker_id = new.id and ended_at is null;
  end if;
  select name into pname from projects where id = new.project_id;
  insert into worker_history (worker_id, state_code, project_id, project_name, started_at)
  values (new.id, new.current_city, new.project_id, pname, now());
  return new;
end $$;

drop trigger if exists trg_worker_history on public.workers;
create trigger trg_worker_history after insert or update on public.workers
  for each row execute function public.log_worker_history();

-- a renamed project is renamed in the history too
create or replace function public.sync_history_project_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update worker_history set project_name = new.name where project_id = new.id;
  return new;
end $$;

drop trigger if exists trg_history_project_name on public.projects;
create trigger trg_history_project_name after update of name on public.projects
  for each row execute function public.sync_history_project_name();

-- 4. existing workers: start their history from the day they were added
insert into public.worker_history (worker_id, state_code, project_id, project_name, started_at)
select w.id, w.current_city, w.project_id, p.name, w.created_at
from public.workers w left join public.projects p on p.id = w.project_id
where not exists (select 1 from public.worker_history h where h.worker_id = w.id);
