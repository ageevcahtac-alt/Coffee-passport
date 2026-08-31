-- =========================================================
-- Platform feedback: an 'admin' profile role + public.platform_feedback
-- =========================================================
-- Adds 'admin' as a fifth public.profiles role (scoped like 'enthusiast'
-- — no cafe_id/roaster_id/barista_id, it isn't tied to one org) so
-- /dashboard/admin can be gated by requireStaffRole.ts exactly like the
-- three staff dashboards, and extends dev_seed_staff_profile() (see
-- 0008_dev_seed_staff_profile.sql) with a fourth pilot account
-- (admin@test.com) so DevRoleSwitcher's Админ-dashboard button works the
-- same zero-setup way as the other three.
--
-- As with every migration in this project: I cannot apply this one myself
-- (no CLI access token, no service-role key, direct Postgres connections
-- are outside this sandbox's policy). Apply via the Supabase SQL Editor,
-- or `supabase db push` after `supabase login && supabase link
-- --project-ref vodmmtzclvqemcujwmdf`.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('enthusiast', 'barista', 'cafe_admin', 'roaster_admin', 'admin'));

alter table public.profiles drop constraint if exists profiles_role_scope_check;
alter table public.profiles
  add constraint profiles_role_scope_check
  check (
    (role in ('enthusiast', 'admin') and cafe_id is null and roaster_id is null and barista_id is null)
    or (role = 'barista' and cafe_id is not null and barista_id is not null and roaster_id is null)
    or (role = 'cafe_admin' and cafe_id is not null and roaster_id is null and barista_id is null)
    or (role = 'roaster_admin' and roaster_id is not null and cafe_id is null and barista_id is null)
  );

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

-- =========================================================
-- PLATFORM_FEEDBACK — the "Обратная связь" widget on every dashboard
-- (see components/shared/FeedbackWidget.tsx) writes here. Deliberately no
-- "user reads own feedback" policy: only public.profiles.role = 'admin'
-- can read (or update the status), matching exactly what was asked for —
-- a submitter gets a local "spasibo" confirmation in the UI, not a
-- read-back from the DB.
-- =========================================================
create table if not exists public.platform_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_role text not null,
  feedback_type text not null check (feedback_type in ('bug', 'ui', 'idea')),
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_feedback_status on public.platform_feedback(status);
create index if not exists idx_platform_feedback_role on public.platform_feedback(user_role);
create index if not exists idx_platform_feedback_created on public.platform_feedback(created_at desc);

alter table public.platform_feedback enable row level security;

create policy "authenticated users create own feedback" on public.platform_feedback
  for insert
  with check (auth.uid() = user_id);

create policy "admin reads all feedback" on public.platform_feedback
  for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Not asked for verbatim, but a triage list with no way to change status
-- ("Новое"/"В работе"/"Закрыто") isn't actually usable — admins can update
-- any column here, trusted the same way every other admin-only policy in
-- this project is.
create policy "admin updates feedback" on public.platform_feedback
  for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select, insert, update on public.platform_feedback to authenticated;
