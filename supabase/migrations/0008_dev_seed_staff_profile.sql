-- =========================================================
-- Dev-only self-service seeding for the three pilot staff accounts
-- =========================================================
-- 0007 deliberately left public.profiles with no self-service update
-- policy — a guest must never be able to grant themselves 'roaster_admin'
-- by calling the API directly. This migration does NOT weaken that: it
-- adds one narrow, security-definer RPC that only ever promotes the
-- CALLING user's own profile, and only when that user's email is one of
-- exactly three hardcoded pilot addresses (barista@test.com,
-- cafe@test.com, roaster@test.com — the same three DevRoleSwitcher's
-- buttons sign in as, see app/auth/actions.ts). Any other authenticated
-- user calling this gets an exception, not a role.
--
-- This exists purely so a developer can click a DEV-panel button and land
-- in a staff cabinet with zero manual setup (no hand-run SQL, no
-- Dashboard clicking) — it is not a general role-assignment mechanism and
-- should not be treated as one. A real production rollout with real
-- staff accounts should drop this function entirely and go back to
-- assigning roles by hand (or build proper admin tooling for it).
--
-- As with every migration in this project so far: I cannot apply this one
-- myself (no CLI access token, no service-role key, direct Postgres
-- connections are outside this sandbox's policy). Apply via the Supabase
-- SQL Editor, or `supabase db push` after `supabase login && supabase
-- link --project-ref vodmmtzclvqemcujwmdf`.

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
begin
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
    else
      raise exception
        'dev_seed_staff_profile: % is not a recognized pilot demo account (expected barista@test.com, cafe@test.com or roaster@test.com)',
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
