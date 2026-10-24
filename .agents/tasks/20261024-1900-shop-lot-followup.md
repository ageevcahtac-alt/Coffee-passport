# 20261024-1900-shop-lot-followup

Цель: доделка 20261024-1600-shop-lot-path. (1) Доказать на проде, что оценки из обоих путей (слепой в кофейне и после «Я в магазине») доходят до кабинетов кофейни `shop-xo-vsevolozhsk` и обжарщика XO с флагом `profile_seen_before_tasting` false/true; после уборки — что их там нет. (2) Отложенный каппинг: лот, открытый через «Я в магазине», виден в «Моё кофейное путешествие» как «Не попробован» с кнопкой «Пройти каппинг» → слепой путь.
Автор: Claude — проверочный workflow и скрипты (одна цепочка с паролями, как в 20261024-1430-owner-cabinets), UI и тесты. Codex — миграция, если проверка найдёт недоставку на уровне схемы. Ревью: diff Claude → Codex review; diff Codex → code-reviewer.

## Схема (что выяснено)
- Путешествие (`app/(site)/journey/page.tsx`, `CoffeeJourney.tsx`) строится только из оценок (`checkins`). Лот, открытый в магазине без оценки, туда не попадает → нужно хранилище «открытых в магазине» лотов.
- `checkins_roaster_view` (0021) — явный список колонок, `profile_seen_before_tasting` в нём нет → кабинет обжарщика флаг не получает. Подтвердить на проде, затем чинить новой миграцией.
- `checkins.owner_user_id` → `auth.users` on delete cascade; уборка всё равно удаляет оценки явно и проверяет.
- Учётки кабинетов — локально `.secrets/cabinet-credentials.txt`; секреты GitHub `CABINET_*` удалены в прошлой задаче → ставить временно и удалить после прогона.

## План
1. `deploy/timeweb/verify-checkin-delivery.py` (на сервере): лот XO; временный энтузиаст; оценки энтузиаста (service role); вход кофейни и обжарщика паролем (GoTrue, anon key — как форма) и чтение тех же источников, что кабинеты (`checkins` по `coffee_shop_id`, `checkins_roaster_view`); уборка. Пароли и email только stdin.
2. `scripts/ops/verify-checkin-delivery.cjs` (Playwright на раннере): вход энтузиаста через форму; слепая оценка (кофейня → XO Всеволожск → дегустация); второй контекст: «Я в магазине» → «Пройти каппинг» → оценка.
3. `.github/workflows/verify-checkin-delivery.yml`: только вручную; до уборки — PASS/FAIL по кабинетам; уборка; после — PASS, если в кабинетах 0 строк.
4. Прогон. Недоставка → фикс → повтор.
5. Хранилище `lib/journey/shopLotsStore.ts` (лоты, открытые в магазине, по пользователю), запись из вида `lot-info`; блок «Не попробован» с кнопкой «Пройти каппинг» → `/passport/<lot>?entry=cafe` (сразу выбор кофейни). Тесты сначала красные.
6. Скриншот путешествия 390 px. PR → CI → Codex review → merge → deploy → site-health.

## Критерии готовности
- Прогон проверки: до уборки PASS кофейня 2/2 (false, true), обжарщик 2/2 (false, true); после уборки 0 строк в обоих кабинетах, энтузиаст удалён; в логе нет email и паролей.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — зелёные; новые тесты красные до правки.
- deploy зелёный, site-health fails 0; секретов `CABINET_*` нет после прогона.

## НЕ трогать
UI кабинетов (`app/dashboard/**`, `components/cafe|roaster|barista/**`), вход (`app/auth/**`, `middleware.ts`), старые миграции, остальное в путешествии (карта, трофеи, история оценок).

## Итог 20261024-1900-shop-lot-followup
Запланировано: 1–6 выше.
Написал: Claude — `deploy/timeweb/verify-checkin-delivery.py`, `scripts/ops/verify-checkin-delivery.cjs`, `.github/workflows/verify-checkin-delivery.yml` (PR #15); `lib/journey/shopLotsStore.ts`(+test), `components/coffee/UntastedShopLots.tsx`(+test), `app/(site)/journey/page.tsx`, `app/(site)/passport/[lotId]/{page.tsx,passportView.ts}`, `lib/journey/claimAnonymousData.ts` (PR #18). Codex — `supabase/migrations/0035_checkins_roaster_view_profile_seen.sql`, `supabase/checkinsRoasterViewProfileSeen.test.ts` (PR #17).
Ревью: PR #15 — Codex 2/2; PR #17 — code-reviewer 1/2 (accept); PR #18 — Codex 2/2
  принято: звезда оценки — role radio → `verify-checkin-delivery.cjs`; скриншот только после входа → там же; отложенные лоты терялись после входа → `claimShopLotsForUser` в `shopLotsStore.ts` + `claimAnonymousData.ts`
  отклонено: «проверка обжарщика всегда падает: во view нет флага» — это и есть дефект прода, найден проверкой, чинится 0035
Проверки: verify-checkin-delivery run 40097448652: 2× оценка HTTP 201; кофейня 2/2 ['false','true'] PASS; обжарщик 2/2 ['нет поля','нет поля'] FAIL; после уборки — энтузиаст удалён, 0 строк в базе и обоих кабинетах; в логе 0 совпадений с email/паролями
  тесты UI: до правки 2 failed | 4 passed, затем claim 2 failed | 6 passed; после — lib/journey 84 passed; tsc 0; lint ok; build ok; CI check pass (#15, #17, #18)
  0035: code-reviewer — supabase/ 11 passed, три поломки → красные
  deploy 40099452340 success (8c5f995), /api/health {"status":"ok","db":"ok"}; site-health 40099615945 `checked 79 urls, pages 18, fails 0`
Merge: PR #15, #17, #18 → `fix/pre-pilot-shortlist`; секреты CABINET_* удалены
  0035 на проде: db-migrate run 40100860969 success (запустил владелец), `checkins_roaster_view.profile_seen_before_tasting | boolean`
  повтор verify-checkin-delivery run 40101010926: 2× оценка HTTP 201; кофейня 2/2 ['false','true'] PASS; обжарщик 2/2 ['false','true'] PASS; после уборки — энтузиаст удалён, 0 строк в базе и обоих кабинетах; в логе 0 совпадений с email/паролями; CABINET_* удалены
Результат: done
