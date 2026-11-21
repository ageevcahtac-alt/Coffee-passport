-- Харнесс интеграционного прогона миграции 0052 (workflow migration-test,
-- job cafe-ratings). Воспроизводит минимальный док-миграционный скелет:
-- auth.users, стаб auth.uid() (читает request.jwt.claims — как в образе
-- supabase/postgres), роли anon/authenticated (в чистом postgres:16 их нет),
-- profiles и coffee_shops в объёме, нужном 0052. RLS-политики profiles не
-- воспроизводим: RPC 0052 — security definer и обходит RLS, прямые select'ы
-- cafe_ratings проверяются собственными политиками 0052 через set role.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create role anon nologin;
create role authenticated nologin;

-- auth.uid() — как в Supabase: sub из JWT-claims; в тесте выставляем GUC.
-- Пустая строка GUC (сценарий «аноним» в assert.sql) — не JSON, поэтому
-- стаб терпит её как NULL: в проде auth.uid() при отсутствии claims
-- возвращает NULL через тот же current_setting(..., true).
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select case
    when btrim(coalesce(current_setting('request.jwt.claims', true), '')) = '' then null
    else (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
  end
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'enthusiast',
  cafe_id text,
  barista_id text,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

create table public.coffee_shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- Два гостя (у g2 имени нет — проверка фолбэка «Гость без имени»),
-- бариста кофейни shop-a (staff-граница чтения), две партнёрские кофейни.
insert into auth.users (email) values
  ('g1@example.com'),
  ('g2@example.com'),
  ('staff-a@example.com');

insert into public.profiles (id, role, cafe_id, barista_id, display_name, email)
select u.id,
       case u.email
         when 'staff-a@example.com' then 'barista'
         else 'enthusiast'
       end,
       case when u.email = 'staff-a@example.com' then 'shop-a' end,
       case when u.email = 'staff-a@example.com' then 'barista-1' end,
       case when u.email = 'g1@example.com' then 'Анна' end,
       u.email
from auth.users u;

insert into public.coffee_shops (slug, name) values
  ('shop-a', 'Кофейня А'),
  ('shop-b', 'Кофейня Б');

-- Политики cafe_ratings читают profiles подзапросом от имени вызывающего
-- (как в проде, где 0050 выдал authenticated SELECT на profiles). Гранты —
-- после создания таблиц: grant на несуществующую relation падает.
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
