-- =========================================================
-- TEST SEED (владелец): xocoffee@list.ru — переезд ордена на «Хранитель вкуса»
--
-- Правило ордена (0043): орден существует только на высшем ранге «Зала».
-- Сид 0041 закрепил орден на «Энтузиасте» — эта миграция переводит его на
-- «Хранитель вкуса»: orden_rank_id и кэш current_rank_id = топовый ранг,
-- orden_pinned сохраняется. История (чеки/зёрна/карта) не трогается:
-- зёра 3 113 живых, карта 2 000 ₽, траты за 30 дней прежние.
--
-- Пометка сохраняется в public.loyalty_test_seeds под той же batch-меткой
-- owner-xocoffee-2026-11-11 (без дублей: если статус уже зарегистрирован
-- сидом 0041, строка не дублируется), поэтому откат 0042 по-прежнему
-- снимает весь батч целиком, включая строку статуса, и остаётся идемпотентен.
--
-- Идемпотентна: повторный прогон выставляет те же значения и не дублирует
-- реестр. Если учётка/статус не найдены — notice и выход, без исключений
-- (сид необязателен для свежих окружений).
-- =========================================================

do $$
declare
  v_guest uuid;
  v_shop text := 'shop-xo-vsevolozhsk';
  v_top_rank_id uuid;
  v_status_id uuid;
  v_batch text := 'owner-xocoffee-2026-11-11';
begin
  select id into v_guest from auth.users where lower(email) = 'xocoffee@list.ru';
  if v_guest is null then
    raise notice 'test seed move: account % not found — nothing to move', 'xocoffee@list.ru';
    return;
  end if;

  select id into v_top_rank_id
  from public.shop_ranks
  where shop_id = v_shop and circuit = 'hall'
  order by rank_order desc
  limit 1;

  if v_top_rank_id is null then
    raise notice 'test seed move: hall ladder missing at % — nothing to move', v_shop;
    return;
  end if;

  update public.guest_shop_statuses
  set orden_rank_id = v_top_rank_id,
      current_rank_id = v_top_rank_id,
      orden_pinned = true,
      updated_at = now()
  where guest_id = v_guest and shop_id = v_shop
  returning id into v_status_id;

  if v_status_id is null then
    raise notice 'test seed move: no guest_shop_statuses row for the seed account — nothing to move';
    return;
  end if;

  if not exists (
    select 1 from public.loyalty_test_seeds
    where batch = v_batch and table_name = 'guest_shop_statuses' and row_id = v_status_id
  ) then
    insert into public.loyalty_test_seeds (batch, table_name, row_id)
    values (v_batch, 'guest_shop_statuses', v_status_id);
  end if;
end $$;
