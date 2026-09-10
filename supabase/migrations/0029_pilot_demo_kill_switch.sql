-- =========================================================
-- Pilot demo kill switch — production readiness hardening.
--
-- 0008_dev_seed_staff_profile.sql's own comment already says it: "A real
-- production rollout with real staff accounts should drop this function
-- entirely and go back to assigning roles by hand." Rather than dropping
-- it outright (this deployment is still the pilot demo the app's own
-- comments describe DevRoleSwitcher as being for), this adds one
-- explicit, DB-level off switch so the *deepest* vector — calling
-- public.dev_seed_staff_profile() directly over the Supabase REST/RPC
-- API, bypassing the Next.js UI/server-action gate entirely — can be
-- closed with a single row update, with no code deploy needed, the
-- moment this stops being a pilot.
--
-- Defaults to enabled (true) so today's pilot/demo behavior on the live
-- Render site is unchanged by this migration. Before onboarding any real
-- (non *@test.com) roaster/café/barista account:
--   update public.app_settings set value = false where key = 'pilot_demo_enabled';
-- =========================================================

create table if not exists public.app_settings (
  key text primary key,
  value boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('pilot_demo_enabled', true)
on conflict (key) do nothing;

-- Read-only for everyone (app/auth/actions.ts's signInAsPilotStaff checks
-- this server-side too, but a direct RPC caller has no other way to see
-- whether the switch is on); no client write path — flipping it is a
-- manual admin action (Supabase SQL editor / dashboard), same as every
-- other migration in this project.
alter table public.app_settings enable row level security;

create policy "public reads app settings" on public.app_settings
  for select using (true);

create or replace function public.dev_seed_staff_profile()
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_role text;
  v_cafe_id text;
  v_roaster_id text;
  v_barista_id text;
  v_profile public.profiles;
  v_enabled boolean;
begin
  select value into v_enabled from public.app_settings where key = 'pilot_demo_enabled';

  if v_enabled is not true then
    raise exception 'dev_seed_staff_profile: pilot demo mode is disabled';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  if v_email is null then
    raise exception 'dev_seed_staff_profile: no authenticated user';
  end if;

  case v_email
    when 'barista@test.com' then
      v_role := 'barista';
      v_cafe_id := 'shop-xo-vsevolozhsk';
      v_barista_id := 'barista-xo-alexey';
    when 'cafe@test.com' then
      v_role := 'cafe_admin';
      v_cafe_id := 'shop-xo-vsevolozhsk';
    when 'roaster@test.com' then
      v_role := 'roaster_admin';
      v_roaster_id := 'roaster-xo';
    when 'admin@test.com' then
      v_role := 'admin';
    else
      raise exception
        'dev_seed_staff_profile: % is not a recognized pilot demo account (expected barista@test.com, cafe@test.com, roaster@test.com or admin@test.com)',
        v_email;
  end case;

  insert into public.profiles (id, role, cafe_id, roaster_id, barista_id)
  values (auth.uid(), v_role, v_cafe_id, v_roaster_id, v_barista_id)
  on conflict (id) do update
    set role = excluded.role,
        cafe_id = excluded.cafe_id,
        roaster_id = excluded.roaster_id,
        barista_id = excluded.barista_id,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.dev_seed_staff_profile() to authenticated;
