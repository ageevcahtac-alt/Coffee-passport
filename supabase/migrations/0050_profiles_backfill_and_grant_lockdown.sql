-- =========================================================
-- Backfill недостающих строк public.profiles + возврат грантов
-- profiles к каноничному набору миграций
-- =========================================================
-- Диагностика 2026-11-20 (баги «профиль не сохраняется» и «Гость не найден»,
-- общий корень): на проде у 2 из 20 auth.users (аккаунты 2026-08-12 и
-- 2026-08-30, созданные ДО наката 0007) строки profiles НЕТ. Для такого
-- аккаунта UPDATE profiles ... where id = auth.uid() не меняет ни одной
-- строки — PostgREST возвращает 200 с пустым телом ([]), клиент честно
-- показывает «Сервер не сохранил изменения», после рефреша поля пустые; тот
-- же пустой набор возвращает staff-чтение по QR (фильтр role='enthusiast'
-- не на чем сработать) → «Гость не найден». Политики 0048 при этом на месте
-- (pg_policios проверены) — дело не в них, а в отсутствии строк.
--
-- Почему строк не было: триггер 0007 on_auth_user_created_profile появился
-- позже этих аккаунтов. Здесь: (1) backfill insert ... select ... on
-- conflict (id) do nothing — идемпотентно, существующие строки не трогает,
-- роль досылаемой строки — 'enthusiast' (дефолт триггера, staff-привязки
-- идут только явными апдейтами); (2) триггер пересоздаём детерминированно
-- (drop if exists + create — паттерн 0007/0012), чтобы на любой базе
-- новые регистрации снова гарантированно получали строку.
--
-- (3) Гранты. Диагностика показала дрейф: у anon/authenticated на profiles
-- table-level INSERT/UPDATE/REFERENCES (и SELECT у anon). Ни одна миграция
-- этого не давала — это дефолтные привилегии образа supabase/postgres
-- (GRANT ALL ON TABLES), действующие на всех таблицах. Практический эффект
-- дрейфа на profiles: column-grant 0012/0046/0048 («гость правит только 4
-- self-editable колонки») был перекрыт — любой authenticated мог обновить
-- ЛЮБУЮ колонку своей строки, включая role/cafe_id/barista_id (check-
-- constraint profiles_role_scope_check не спасает: связка
-- role='barista'+cafe_id+barista_id ему валидна) — самоназначение чужой
-- роли бариста. Возвращаем задокументированный набор: SELECT (0007) +
-- column-level UPDATE на четыре self-editable колонки. Клиентские пути
-- записи — только updateOwnProfile (4 колонки), INSERT из клиента никто не
-- делает (строку создаёт триггер, security definer, в обход RLS).
--
-- Идемпотентность: backfill — on conflict do nothing; триггер — drop+create;
-- revoke/grant — сами по себе идемпотентны. Повторный прогон на любом
-- состоянии даёт тот же результат и не трогает данные.
--
-- Проверка после наката:
--   select count(*) from auth.users u left join public.profiles p
--     on p.id = u.id where p.id is null;  -- ожидается 0
--   select policyname from pg_policies
--     where schemaname='public' and tablename='profiles';  -- 3 политики 0047/0048
-- =========================================================

insert into public.profiles (id, role, email)
select u.id, 'enthusiast', u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

revoke select, insert, update, references on public.profiles from anon;
revoke insert, update, references on public.profiles from authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, phone, city, favorite_drink) on public.profiles to authenticated;
