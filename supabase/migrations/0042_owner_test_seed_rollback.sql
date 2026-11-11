-- =========================================================
-- TEST SEED ROLLBACK: xocoffee@list.ru — контур «Зал»
--
-- Полное удаление тестового сида (batch owner-xocoffee-2026-11-11) одной
-- командой: удаляет ровно те строки, что зарегистрированы в
-- public.loyalty_test_seeds. Строки НЕ из реестра (чужие/реальные) не
-- трогает. Если орден/статус успели править руками после сида — они
-- останутся (реестр не содержит чужих строк).
--
-- Идемпотентна: повторный прогон удаляет ноль строк и проходит.
-- =========================================================

do $$
declare
  r record;
begin
  for r in select table_name, row_id from public.loyalty_test_seeds where batch = 'owner-xocoffee-2026-11-11' loop
    execute format('delete from public.%I where id = $1', r.table_name) using r.row_id;
  end loop;
  delete from public.loyalty_test_seeds where batch = 'owner-xocoffee-2026-11-11';
end $$;
