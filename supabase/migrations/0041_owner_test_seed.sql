-- =========================================================
-- TEST SEED (владелец): xocoffee@list.ru — контур «Зал»
--
-- Тестовые данные для ручного осмотра ЛК гостя. Владелец в курсе, что данные
-- фейковые; реальных платежей нет, записи консистентны (ledger сходится с
-- балансами). Каждая вставленная строка зарегистрирована в
-- public.loyalty_test_seeds (batch owner-xocoffee-2026-11-11); полное удаление — миграция
-- 0042_owner_test_seed_rollback.sql.
--
-- Идемпотентность: повторный прогон падает (batch уже есть), ничего не
-- дублирует. Если учётка не найдена — исключение ДО любых вставок,
-- транзакция откатывается целиком (миграция идёт под psql -1).
-- =========================================================

create table if not exists public.loyalty_test_seeds (
  id uuid primary key default gen_random_uuid(),
  batch text not null,
  table_name text not null,
  row_id uuid not null,
  created_at timestamptz not null default now()
);

do $$
declare
  v_guest uuid;
  v_batch text := 'owner-xocoffee-2026-11-11';
begin
  select id into v_guest from auth.users where lower(email) = 'xocoffee@list.ru';
  if v_guest is null then
    raise exception 'test seed: account % not found — nothing created', 'xocoffee@list.ru';
  end if;
  if exists (select 1 from public.loyalty_test_seeds where batch = v_batch) then
    raise exception 'test seed: batch % already applied', v_batch;
  end if;

  -- 1. История потребления: 22 чека (14 крупных заказов 31–80 дней назад —
  --    их кэшбэк жив в окне 90 дней от последней покупки; 8 чеков 350–650 ₽
  --    за последние 30 дней).
  insert into public.loyalty_consumptions
    (id, guest_id, shop_id, rank_id, gross_amount, beans_redeemed, card_amount, cash_amount, beans_earned, welcome_granted, created_at)
  values
  ('3f98d10e-b2ac-4039-b76b-a72b58920fdc', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Первый глоток'), 1800, 0, 0, 1800, 36, 300, now() - interval '80 days'),
  ('66d05d01-f4a7-4f56-83d5-3c56ff91615b', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Любитель'), 2200, 0, 0, 2200, 66, 0, now() - interval '76 days'),
  ('3ee1e6b4-5985-4820-bd85-fa8d4bab86e0', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Ценитель'), 1600, 0, 0, 1600, 80, 0, now() - interval '72 days'),
  ('903695d4-6732-451e-b545-13e9f3f1a124', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Знаток'), 2500, 0, 0, 2500, 150, 0, now() - interval '68 days'),
  ('b6b96af7-80a4-4024-8ef5-0c1d88729e3a', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Энтузиаст'), 1900, 0, 0, 1900, 152, 0, now() - interval '64 days'),
  ('9c5a16ac-c3f6-409e-b8c5-4db5d400f8b4', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 2300, 0, 0, 2300, 230, 0, now() - interval '60 days'),
  ('a6475d19-6471-40a3-aebd-f51b58344197', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 1700, 0, 0, 1700, 170, 0, now() - interval '56 days'),
  ('b4afb43f-5396-4450-9543-b364f9ca1d4e', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 2100, 0, 0, 2100, 210, 0, now() - interval '52 days'),
  ('011df81b-1756-440c-81b4-04f65bd7ca6a', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 2600, 0, 0, 2600, 260, 0, now() - interval '48 days'),
  ('e7d5186c-07b5-42c6-af7c-94a9a77a1da9', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 2000, 0, 0, 2000, 200, 0, now() - interval '44 days'),
  ('c8de34b9-63a2-4594-8518-c532db6c6e7d', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 1800, 0, 0, 1800, 180, 0, now() - interval '40 days'),
  ('d110867b-fc80-4f42-8687-86a3da23974d', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 2400, 0, 0, 2400, 240, 0, now() - interval '36 days'),
  ('07728750-eb6b-4175-869f-35a11a49e9f9', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 2200, 0, 0, 2200, 220, 0, now() - interval '32 days'),
  ('575e6662-fb1f-4ebe-9dca-a2bd5f09fce0', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 1600, 0, 0, 1600, 160, 0, now() - interval '31 days'),
  ('5e5d0d21-1a73-4a9f-83f4-ff38ed208876', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 650, 0, 0, 650, 65, 0, now() - interval '29 days'),
  ('8b0310f0-b41e-407f-aafd-131df5faa9e2', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 480, 0, 0, 480, 48, 0, now() - interval '26 days'),
  ('f4af8bcb-476b-40a7-b289-b444bf473c0c', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 590, 0, 0, 590, 59, 0, now() - interval '22 days'),
  ('62d91e0d-4af8-42d8-b49d-2c47acc52b96', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 620, 0, 0, 620, 62, 0, now() - interval '18 days'),
  ('c9b0b748-db2e-4de4-9caf-67e8e6358e69', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 350, 0, 0, 350, 35, 0, now() - interval '14 days'),
  ('ec97dc34-b172-4d09-b35e-ccea6b6524ac', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 640, 0, 0, 640, 64, 0, now() - interval '9 days'),
  ('104dec90-9483-4d50-a5a8-762c767d43e4', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 610, 0, 0, 610, 61, 0, now() - interval '6 days'),
  ('2ad498bc-d670-43a4-ac71-d471de06dad3', v_guest, 'shop-xo-vsevolozhsk', (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Хранитель вкуса'), 650, 0, 0, 650, 65, 0, now() - interval '2 days');

  -- 2. Зёрна: welcome 300 ровно один раз (первый чек) + earn с каждого чека.
  insert into public.beans_ledger
    (id, guest_id, shop_id, delta, reason, consumption_id, created_at)
  values
  ('810b4507-2e4f-4da3-882a-9ff6a3d4d38e', v_guest, 'shop-xo-vsevolozhsk', 300, 'welcome', '3f98d10e-b2ac-4039-b76b-a72b58920fdc', now() - interval '80 days'),
  ('ad52068a-ac69-4bb8-9100-48be605775f6', v_guest, 'shop-xo-vsevolozhsk', 36, 'earn', '3f98d10e-b2ac-4039-b76b-a72b58920fdc', now() - interval '80 days'),
  ('7c63307b-8ce5-4f1e-b6b1-a0acc20b195f', v_guest, 'shop-xo-vsevolozhsk', 66, 'earn', '66d05d01-f4a7-4f56-83d5-3c56ff91615b', now() - interval '76 days'),
  ('4b55b901-f7ad-4ff5-a566-b87177c0af47', v_guest, 'shop-xo-vsevolozhsk', 80, 'earn', '3ee1e6b4-5985-4820-bd85-fa8d4bab86e0', now() - interval '72 days'),
  ('ada8fe74-dbb3-4670-af3b-dd394701682c', v_guest, 'shop-xo-vsevolozhsk', 150, 'earn', '903695d4-6732-451e-b545-13e9f3f1a124', now() - interval '68 days'),
  ('50a3fd7e-5a23-4836-90d9-a629f8b0efc6', v_guest, 'shop-xo-vsevolozhsk', 152, 'earn', 'b6b96af7-80a4-4024-8ef5-0c1d88729e3a', now() - interval '64 days'),
  ('bed85476-cd2a-4bac-804d-cbae0772c2ab', v_guest, 'shop-xo-vsevolozhsk', 230, 'earn', '9c5a16ac-c3f6-409e-b8c5-4db5d400f8b4', now() - interval '60 days'),
  ('9d4d00f6-7bee-45c3-aaa1-54e4ca126668', v_guest, 'shop-xo-vsevolozhsk', 170, 'earn', 'a6475d19-6471-40a3-aebd-f51b58344197', now() - interval '56 days'),
  ('544c8a3e-d3bd-4e05-a0dd-082a81aa193a', v_guest, 'shop-xo-vsevolozhsk', 210, 'earn', 'b4afb43f-5396-4450-9543-b364f9ca1d4e', now() - interval '52 days'),
  ('a7c5c81e-de05-4f18-aaf8-4d2862070dae', v_guest, 'shop-xo-vsevolozhsk', 260, 'earn', '011df81b-1756-440c-81b4-04f65bd7ca6a', now() - interval '48 days'),
  ('8b512458-5bca-4f60-a069-47223e326c8c', v_guest, 'shop-xo-vsevolozhsk', 200, 'earn', 'e7d5186c-07b5-42c6-af7c-94a9a77a1da9', now() - interval '44 days'),
  ('6aa99caf-9122-4968-862b-effe6f34d91c', v_guest, 'shop-xo-vsevolozhsk', 180, 'earn', 'c8de34b9-63a2-4594-8518-c532db6c6e7d', now() - interval '40 days'),
  ('9fcf2855-9401-4cc8-9555-d8a849f1077f', v_guest, 'shop-xo-vsevolozhsk', 240, 'earn', 'd110867b-fc80-4f42-8687-86a3da23974d', now() - interval '36 days'),
  ('0b0a713a-d8ff-4b1f-8eaf-835998c6b503', v_guest, 'shop-xo-vsevolozhsk', 220, 'earn', '07728750-eb6b-4175-869f-35a11a49e9f9', now() - interval '32 days'),
  ('a72e6a07-90b8-4b51-a261-f952881e758d', v_guest, 'shop-xo-vsevolozhsk', 160, 'earn', '575e6662-fb1f-4ebe-9dca-a2bd5f09fce0', now() - interval '31 days'),
  ('58102d89-1a56-4383-b338-2b79b11fdfb7', v_guest, 'shop-xo-vsevolozhsk', 65, 'earn', '5e5d0d21-1a73-4a9f-83f4-ff38ed208876', now() - interval '29 days'),
  ('3ee6b371-bd39-4f58-bd4e-584632801e65', v_guest, 'shop-xo-vsevolozhsk', 48, 'earn', '8b0310f0-b41e-407f-aafd-131df5faa9e2', now() - interval '26 days'),
  ('eb31ac7d-7b32-46a3-bf73-919f80742e1a', v_guest, 'shop-xo-vsevolozhsk', 59, 'earn', 'f4af8bcb-476b-40a7-b289-b444bf473c0c', now() - interval '22 days'),
  ('318dcd9e-55d8-4107-9745-a72d42f621f2', v_guest, 'shop-xo-vsevolozhsk', 62, 'earn', '62d91e0d-4af8-42d8-b49d-2c47acc52b96', now() - interval '18 days'),
  ('206994ba-d005-43ae-a629-a199cf69cf34', v_guest, 'shop-xo-vsevolozhsk', 35, 'earn', 'c9b0b748-db2e-4de4-9caf-67e8e6358e69', now() - interval '14 days'),
  ('f8b02489-2b74-4e90-9590-43f3c2338d1b', v_guest, 'shop-xo-vsevolozhsk', 64, 'earn', 'ec97dc34-b172-4d09-b35e-ccea6b6524ac', now() - interval '9 days'),
  ('3c92f379-ea6b-48e2-8b10-c17099ffcfd7', v_guest, 'shop-xo-vsevolozhsk', 61, 'earn', '104dec90-9483-4d50-a5a8-762c767d43e4', now() - interval '6 days'),
  ('3b40fa1b-e47b-40ed-a82c-97cc9293491e', v_guest, 'shop-xo-vsevolozhsk', 65, 'earn', '2ad498bc-d670-43a4-ac71-d471de06dad3', now() - interval '2 days');

  -- 3. Карта-депозит 2000 ₽ + движение topup.
  if exists (select 1 from public.deposit_cards where guest_id = v_guest and shop_id = 'shop-xo-vsevolozhsk') then
    raise exception 'test seed: deposit card already exists for % — aborting', 'xocoffee@list.ru';
  end if;
  insert into public.deposit_cards (id, guest_id, shop_id, balance)
  values ('c20fdfab-9686-4136-acae-b2618d76b174', v_guest, 'shop-xo-vsevolozhsk', 2000);
  insert into public.deposit_card_ledger (id, card_id, delta, reason)
  values ('0f82500a-8353-4cc3-95fb-6acfa9509e2f', 'c20fdfab-9686-4136-acae-b2618d76b174', 2000, 'topup');

  -- 4. Орден «Энтузиаст», pinned — ранг не скользит read-time. Статус
  --    регистрируем для отката только если строка вставлена заново.
  if not exists (select 1 from public.guest_shop_statuses where guest_id = v_guest and shop_id = 'shop-xo-vsevolozhsk') then
    insert into public.guest_shop_statuses (id, guest_id, shop_id, current_rank_id, orden_rank_id, orden_pinned, last_purchase_at)
    values ('69ca4219-5cc1-4365-be0e-0328af49b5fc', v_guest, 'shop-xo-vsevolozhsk',
            (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Энтузиаст'),
            (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Энтузиаст'),
            true, now() - interval '2 days');
    insert into public.loyalty_test_seeds (batch, table_name, row_id)
    values ('owner-xocoffee-2026-11-11', 'guest_shop_statuses', '69ca4219-5cc1-4365-be0e-0328af49b5fc');
  else
    update public.guest_shop_statuses
    set current_rank_id = (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Энтузиаст'),
        orden_rank_id = (select id from public.shop_ranks where shop_id = 'shop-xo-vsevolozhsk' and circuit = 'hall' and rank_name = 'Энтузиаст'),
        orden_pinned = true,
        last_purchase_at = now() - interval '2 days',
        updated_at = now()
    where guest_id = v_guest and shop_id = 'shop-xo-vsevolozhsk';
  end if;

  -- 5. Реестр тестовых строк для точного отката.
  insert into public.loyalty_test_seeds (batch, table_name, row_id)
  values
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '3f98d10e-b2ac-4039-b76b-a72b58920fdc'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '66d05d01-f4a7-4f56-83d5-3c56ff91615b'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '3ee1e6b4-5985-4820-bd85-fa8d4bab86e0'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '903695d4-6732-451e-b545-13e9f3f1a124'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'b6b96af7-80a4-4024-8ef5-0c1d88729e3a'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '9c5a16ac-c3f6-409e-b8c5-4db5d400f8b4'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'a6475d19-6471-40a3-aebd-f51b58344197'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'b4afb43f-5396-4450-9543-b364f9ca1d4e'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '011df81b-1756-440c-81b4-04f65bd7ca6a'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'e7d5186c-07b5-42c6-af7c-94a9a77a1da9'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'c8de34b9-63a2-4594-8518-c532db6c6e7d'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'd110867b-fc80-4f42-8687-86a3da23974d'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '07728750-eb6b-4175-869f-35a11a49e9f9'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '575e6662-fb1f-4ebe-9dca-a2bd5f09fce0'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '5e5d0d21-1a73-4a9f-83f4-ff38ed208876'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '8b0310f0-b41e-407f-aafd-131df5faa9e2'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'f4af8bcb-476b-40a7-b289-b444bf473c0c'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '62d91e0d-4af8-42d8-b49d-2c47acc52b96'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'c9b0b748-db2e-4de4-9caf-67e8e6358e69'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', 'ec97dc34-b172-4d09-b35e-ccea6b6524ac'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '104dec90-9483-4d50-a5a8-762c767d43e4'),
  ('owner-xocoffee-2026-11-11', 'loyalty_consumptions', '2ad498bc-d670-43a4-ac71-d471de06dad3'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '810b4507-2e4f-4da3-882a-9ff6a3d4d38e'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', 'ad52068a-ac69-4bb8-9100-48be605775f6'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '7c63307b-8ce5-4f1e-b6b1-a0acc20b195f'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '4b55b901-f7ad-4ff5-a566-b87177c0af47'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', 'ada8fe74-dbb3-4670-af3b-dd394701682c'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '50a3fd7e-5a23-4836-90d9-a629f8b0efc6'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', 'bed85476-cd2a-4bac-804d-cbae0772c2ab'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '9d4d00f6-7bee-45c3-aaa1-54e4ca126668'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '544c8a3e-d3bd-4e05-a0dd-082a81aa193a'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', 'a7c5c81e-de05-4f18-aaf8-4d2862070dae'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '8b512458-5bca-4f60-a069-47223e326c8c'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '6aa99caf-9122-4968-862b-effe6f34d91c'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '9fcf2855-9401-4cc8-9555-d8a849f1077f'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '0b0a713a-d8ff-4b1f-8eaf-835998c6b503'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', 'a72e6a07-90b8-4b51-a261-f952881e758d'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '58102d89-1a56-4383-b338-2b79b11fdfb7'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '3ee6b371-bd39-4f58-bd4e-584632801e65'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', 'eb31ac7d-7b32-46a3-bf73-919f80742e1a'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '318dcd9e-55d8-4107-9745-a72d42f621f2'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '206994ba-d005-43ae-a629-a199cf69cf34'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', 'f8b02489-2b74-4e90-9590-43f3c2338d1b'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '3c92f379-ea6b-48e2-8b10-c17099ffcfd7'),
  ('owner-xocoffee-2026-11-11', 'beans_ledger', '3b40fa1b-e47b-40ed-a82c-97cc9293491e'),
  ('owner-xocoffee-2026-11-11', 'deposit_cards', 'c20fdfab-9686-4136-acae-b2618d76b174'),
  ('owner-xocoffee-2026-11-11', 'deposit_card_ledger', '0f82500a-8353-4cc3-95fb-6acfa9509e2f');
end $$;
