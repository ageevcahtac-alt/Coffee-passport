-- =========================================================
-- Гость читает СВОЮ строку profiles из браузера — ensure-миграция
--
-- Политика «user reads own profile» заведена в 0007 и никогда не удалялась,
-- но на проде блок профиля в ЛК (/loyalty) не рендерился: fetchOwnProfile
-- молча возвращал null. Фронт теперь показывает ошибку чтения в блоке
-- (пакет №3), а эта миграция детерминированно устраняет саму причину, если
-- на конкретной базе политика потерялась/изменена вне миграций (ручные
-- правки, восстановление из дампа): drop+create по паттерну идемпотентности
-- 0013 — повторный прогон даёт тот же результат.
--
-- Почему это безопасно: разрешение узкое — только своя строка (auth.uid() =
-- id), только чтение. UPDATE-политика 0012/0046 (четыре self-editable
-- колонки) не трогается. Staff-чтение «staff read enthusiast display
-- names» (0013) — отдельная политика, тоже не трогается.
--
-- Проверка после наката:
--   select policyname, cmd, qual from pg_policies
--     where schemaname = 'public' and tablename = 'profiles';
-- =========================================================

drop policy if exists "user reads own profile" on public.profiles;

create policy "user reads own profile" on public.profiles
  for select using (auth.uid() = id);
