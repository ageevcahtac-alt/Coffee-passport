# 20261025-1000-barista-followups — доделки после 20261024-2100-barista-accounts

## Разбор (до изменений)
- Форма оценки гостя (`app/(site)/passport/[lotId]/taste/page.tsx`) берёт бариста из статического
  `getBaristasForShop` (`lib/data/baristas.ts`) — бариста, созданный кофейней, в ней не виден.
  Синк `barista_profiles` не удаляет из localStorage бариста, которых уже нет в базе.
- Флаг `must_change_password` проверяет только `requireStaffRole` (интерфейс). Лояльность (RPC
  `loyalty_redeem`, `loyalty_sell_subscription`) и чтение таблиц идут из браузера напрямую в PostgREST,
  RLS и RPC смотрят только `profiles.role` → с временным паролем бариста может списывать.
- Срока у временного пароля нет; выдать новый кофейня не может.
- «Команда»: две кнопки (форма учётки и «+ Добавить сотрудника» → HR-карточка в localStorage).

## Решение
Учётка с временным паролем — профиль `enthusiast` (без прав бариста), привязка (cafe_id, barista_id,
срок) — в `app_metadata` (пишет только service role). Права бариста (`profiles.role = 'barista'`)
выдаются в момент смены пароля. Все RLS и RPC проверяют `profiles.role` → закрыты без миграции,
в том числе будущие. Плюс явная проверка флага в `requireStaffApi` (403 `password_change_required`).

## Автор
Claude — всё (п. 7 — по прецеденту 20261024-1900/2100: проверочный стенд к своей фиче). Ревью — Codex.

## План
1. `lib/auth/temporaryPassword.ts`: срок 72 ч, состояние none/active/expired, метаданные ожидания.
2. `POST /api/cafe/staff/barista-accounts`: профиль `enthusiast`, привязка и срок в `app_metadata`.
   `GET` — учётки кофейни со статусом. `PATCH` — новый временный пароль (снять права бариста → пароль
   + срок; сбой — вернуть права).
3. Смена пароля: истёк → отказ; иначе выдать права бариста по привязке, затем пароль и снятие флага.
4. Вход (`signInWithPassword`): временный пароль истёк → выйти и показать ошибку; действует → на смену
   пароля. `requireStaffApi`: флаг → 403.
5. Форма оценки, аналитика и отзывы кофейни — бариста из базы; синк убирает удалённых.
6. «Команда»: одна кнопка «+ Добавить сотрудника» → форма учётки; список учёток со статусом и
   «Выдать новый временный пароль»; старые карточки из браузера — показаны с пометкой; страницы
   new/edit карточек — редирект, запись в localStorage удалена.
7. `verify-barista-access`: временный бариста за прогон → видно в форме оценки → API отклоняет
   действие до смены пароля → просроченный пароль не пускает → кофейня выдаёт новый → смена пароля →
   оценка гостя дошла в его кабинет; уборка временного бариста и оценки; проверка до и после уборки.

## Критерии готовности
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — зелёные; новые тесты сначала красные.
- `verify-barista-access` на проде — все PASS до и после уборки.
- `site-health` — fails 0.

## Не трогать
Миграции; форму регистрации на главной; реальных гостей, бариста и их строки.

## Итог 20261025-1000-barista-followups
Запланировано: 1. срок 72 ч и состояние временного пароля 2. API учёток POST/GET/PATCH 3. смена пароля с выдачей прав 4. вход и гейт в API 5. бариста из базы в форме оценки 6. «Команда» с одной кнопкой 7. проверка на проде.
Написал: Claude — всё (п. 7 по прецеденту 20261024-1900/2100).
  lib/auth/temporaryPassword.ts, lib/auth/grantBaristaRights.ts, app/api/cafe/staff/barista-accounts/route.ts,
  app/auth/actions.ts, app/auth/change-password/{actions,page}.ts(x), lib/auth/requireStaffApi.ts,
  lib/data/baristaProfileStore.ts, app/(site)/passport/[lotId]/taste/page.tsx, analytics, ServiceReviewCard,
  app/dashboard/cafe/(hub)/team/page.tsx, components/cafe/BaristaAccount{Form,sList}.tsx, cafeStaffStore (только чтение),
  staff/new и staff/[id]/edit → редирект, StaffForm удалён; verify-barista-access.{yml,py,cjs}.
Ревью: Codex, PR #25 — 2/2 раунда.
  принято: права выдавались до смены пароля → сначала пароль, потом права, затем повторная проверка флага (grantBaristaRights.ts);
           PATCH снимал права только у «активной» учётки → снимает всегда, до и после установки флага (route.ts);
           синк без пагинации мог выбросить живых бариста → постранично по 500 (baristaProfileStore.ts);
           устаревший запрос смены пароля перезаписывал новый временный → сверка срока перед обновлением (change-password/actions.ts).
  отклонено (частично): полная сериализация смены пароля и перевыдачи — нужна блокировка в БД (миграция). Остаток — миллисекунды
           между двумя запросами админ-API; временный пароль знают только кофейня (у cafe_admin те же права в этой кофейне) и сам бариста.
Проверки: тесты сначала красные — 18 failed | 33 passed, после ревью ещё 5 + 2 + 5 + 5 красных; итог `npx vitest run`: 385 passed,
  1 файл scripts/ops/redact.test.ts падает локально (CRLF после shebang на Windows, не связан, в CI зелёный);
  tsc ok; lint ok (8 frozen); next build ok; CI check PR #25 — success (7516814).
  deploy run 40181147699 — success; site-health run 40181328690 — checked 78 urls, pages 18, fails 0.
  verify-barista-access run 40184604807 — success, все PASS до и после уборки: временный бариста виден в форме оценки, оценка 5 дошла
  в его кабинет; до смены пароля rpc loyalty_redeem / loyalty_sell_subscription -> HTTP 400, чтение лояльности гостя — 0 строк, баланс 1000;
  просроченный временный пароль -> «Срок временного пароля (72 часа) истёк…»; новый пароль от кофейни -> HTTP 200 -> смена -> кабинет;
  списание 317 ₽ 1000 -> 683; чужие строки (checkins 13, statuses 2, transactions 4, subscriptions 1) — 0 изменений; после уборки
  гостя, его оценки и временного бариста нет. Совпадений email/паролей в логе: 0. Секреты CABINET_* удалены.
  site-health run 40184812452 — checked 78 urls, pages 18, fails 0.
Merge: PR #25 → fix/pre-pilot-shortlist (9f3602c), deploy зелёный.
Результат: done
