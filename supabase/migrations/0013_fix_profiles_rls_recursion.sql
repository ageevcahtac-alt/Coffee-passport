-- =========================================================
-- Fix: infinite recursion in the "staff read enthusiast display names"
-- policy added by 0012_loyalty_module.sql
-- =========================================================
-- That policy's USING clause queried public.profiles from within a policy
-- defined ON public.profiles itself:
--
--   create policy "staff read enthusiast display names" on public.profiles
--     for select using (
--       profiles.role = 'enthusiast'
--       and exists (select 1 from public.profiles staff where staff.id = auth.uid() ...)
--     );
--
-- Postgres has to re-apply profiles' own row security to evaluate that
-- inner "select 1 from public.profiles", which requires evaluating THIS
-- SAME policy again, and so on — Postgres detects this and raises
-- "infinite recursion detected in policy for relation \"profiles\"",
-- which PostgREST surfaces as a bare 500. That took down every query
-- against profiles, including requireStaffRole.ts's own lookup — the
-- actual cause of the barista/cafe/roaster dashboards bouncing back to
-- /auth/login with no visible error after this migration was applied
-- (found while testing the loyalty module end-to-end).
--
-- Fix: move the "is this caller staff" check into a SECURITY DEFINER
-- function. A function's body runs as its OWNER (the migration role, who
-- owns every table here and therefore bypasses RLS on it entirely, same
-- as every other definer function in this project — see
-- dev_seed_staff_profile()) — so the check no longer re-enters profiles'
-- own row security at all, breaking the cycle.
create or replace function public.is_shop_staff()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('barista', 'cafe_admin')
  );
$$;

grant execute on function public.is_shop_staff() to authenticated;

drop policy if exists "staff read enthusiast display names" on public.profiles;

create policy "staff read enthusiast display names" on public.profiles
  for select
  using (profiles.role = 'enthusiast' and public.is_shop_staff());
