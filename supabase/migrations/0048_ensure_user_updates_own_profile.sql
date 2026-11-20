-- =========================================================
-- Гость пишет СВОЮ строку profiles из браузера — ensure-миграция
--
-- Симптом пакета №4: владелец заполнил мини-профиль в /loyalty, форма
-- показала успех, после перезагрузки страницы поля пустые. PostgREST на
-- UPDATE, который RLS-политика не пустила, возвращает 200 с пустым телом —
-- молчаливая потеря записи, которую старый клиент не отличал от успеха.
--
-- UPDATE-политика «user updates own display name» заведена в 0012 и не
-- удалялась миграциями, но на конкретной базе могла потеряться/измениться
-- вне миграций (ручные правки, восстановление из дампа) — та же причина,
-- по которой 0047 пересоздавала SELECT-политику. Эта миграция
-- детерминированно восстанавливает и write-path: drop+create по паттерну
-- идемпотентности 0013/0047 — повторный прогон даёт тот же результат.
-- Заодно повторно фиксирует column-grant 0046 (grant идемпотентен сам):
-- без него UPDATE разрешён политикой, но на уровне привилегий колонок
-- UPDATE отклонится молча тем же пустым 200.
--
-- Почему это безопасно: разрешение узкое — только своя строка
-- (auth.uid() = id), только UPDATE, только на четыре self-editable колонки
-- (column-grant 0012/0046). role/cafe_id/roaster_id/barista_id/email
-- остаются staff-assigned — гость их переписать не может ни политикой,
-- ни привилегиями. SELECT-политика 0047 и staff-политика 0013 не трогаются.
--
-- Проверка после наката:
--   select policyname, cmd, qual, with_check from pg_policies
--     where schemaname = 'public' and tablename = 'profiles';
--   select column_name, privilege_type from information_schema.role_column_grants
--     where table_schema = 'public' and table_name = 'profiles'
--       and grantee = 'authenticated' and privilege_type = 'UPDATE';
-- =========================================================

drop policy if exists "user updates own display name" on public.profiles;

create policy "user updates own display name" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Тот же набор self-editable колонок, что и в 0046 (grant перечисляет
-- полный набор, повторный — noop).
grant update (display_name, phone, city, favorite_drink) on public.profiles to authenticated;
