-- Харнесс интеграционного прогона миграций 0050/0051 (workflow
-- migration-test). Воспроизводит минимальный док-миграционный скелет:
-- auth.users, public.profiles в версии 0048 (само-editable колонки) и
-- функцию handle_new_user_profile в версии 0012 (0051 переопределит её на
-- генерацию кода). Роли anon/authenticated — как в образе supabase/postgres
-- (0050 отзывает у них table-level гранты; в чистом postgres:16 их нет,
-- поэтому создаём). Таблицы — без RLS-политик: прогоняется write-path
-- триггера и гранты, политики 0047/0048 покрыты offline-тестами.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create role anon nologin;
create role authenticated nologin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'enthusiast',
  cafe_id text,
  roaster_id text,
  barista_id text,
  display_name text,
  email text,
  phone text,
  city text,
  favorite_drink text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Версия 0012 (без кода) — досылает email; 0051 заменит тело на генерацию
-- guest_code. Именно эту версию 0050 «вызывает» через триггер.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, email)
  values (new.id, 'enthusiast', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Досид: три аккаунта БЕЗ строки profiles (модель боевых сирот 2026-08).
-- Один из них дальше станет staff — backfill кода 0051 его не должен
-- затронуть (коды только у enthusiast).
insert into auth.users (email) values
  ('orphan-guest-1@example.com'),
  ('orphan-guest-2@example.com'),
  ('orphan-staff@example.com');

-- Досид: staff-строка уже с профилем (кафе-админ) — без кода по определению.
insert into auth.users (email) values ('existing-admin@example.com');
insert into public.profiles (id, role, email, cafe_id)
select id, 'cafe_admin', email, 'shop-x' from auth.users where email = 'existing-admin@example.com';
