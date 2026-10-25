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
