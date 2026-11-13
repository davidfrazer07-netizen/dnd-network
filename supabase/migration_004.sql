-- DND Network, update 4 — run once in Supabase: SQL Editor > New query > paste > Run.
-- Lets admins add new states (and bring hidden ones back). New contractor logins are created
-- by the manage-contractor function (supabase/functions/manage-contractor/index.ts).

drop policy if exists cities_admin_write on public.cities;
create policy cities_admin_write on public.cities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
