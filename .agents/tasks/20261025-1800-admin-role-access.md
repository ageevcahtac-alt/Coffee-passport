# 20261025-1800-admin-role-access

Цель: заявки партнёров — разобрать путь и вернуть админ-интерфейс `/admin` под обычным входом с ролью `admin`, без Basic Auth.
Автор: Claude (auth, UI). Ревью: Codex `review`. Workflow проверки на проде — тоже Claude (часть задачи доступа), ревью Codex.

## План
1. Разбор без изменений: форма → API → таблица → уведомление → страница; сравнение `/admin` и `/dashboard/admin`.
2. Тесты на доступ по роли (сначала красные): layout `/admin`, `GET/PATCH /api/admin/partner-requests`, middleware.
3. Этап 1 (PR 1): `/admin` и `/api/admin/**` открываются по сессии с ролью `admin`; Basic Auth остаётся запасным путём
   (middleware зовёт Basic только без cookie сессии). Ссылка на `/admin` из `/dashboard/admin` и обратно.
4. Workflow `verify-admin-access` (только чтение заявок): строка заявки XO Coffee без email/телефона; временные учётки
   admin и кофейни; браузер: admin → `/dashboard/admin` → ссылка → `/admin` → заявка видна; кофейня и без входа → закрыт.
5. Этап 2 (PR 2), только после PASS этапа 1 на проде: убрать Basic Auth (middleware, `requireAdminBasicAuth`), повторить проверку.
6. `site-health` — неудач 0.

## Критерии готовности
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — зелёные.
- Тесты доступа по роли падают на старом коде (вывод приложен).
- `gh workflow run verify-admin-access` — PASS после этапа 2.

## Не трогать
- Саму заявку XO Coffee (не одобрять, не менять статус).
- `supabase/password coffee pasport/`, прод-секреты.
- Хранение одобрения и цвета булавки (localStorage) — только описать в итоге.

## Итог
Результат: partial — доступ сделан и доказан на проде; уведомление о заявках не уходит (нет RESEND_API_KEY и PARTNER_NOTIFY_EMAIL), ждём адрес получателя от владельца.
- PR #31 этап 1 (роль admin + Basic запасной), #32 фикс 500 в /admin (requireAdminBasicAuth брал поле `headers` у HeadersAdapter — /admin падал и под Basic), #33 этап 2 (Basic убран), #35 site-health.
- Прод: verify-admin-access run 40208030606 — PASS; site-health run 40208542583 — fails 0.
- Заявка XO: ab107366-51ea-4cbf-bba0-c4fb8b83872c, coffee_shop, new, 2026-10-25 14:58:53 МСК — не менялась.
- Одобрение и цвет булавки в /admin пишутся только в localStorage браузера (lib/data/roasters.ts, coffeeShops.ts) — в базу и на карту у других не попадают. Отдельная задача.
