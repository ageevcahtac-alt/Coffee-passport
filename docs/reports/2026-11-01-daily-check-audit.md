# Daily Check — аудит 2026-11-01

Baseline (checkpoint-to-checkpoint): `.last_audit` = `fbc80b4` (2026-08-31,
«feat: platform feedback system») → HEAD = `9bdc3fc` (merge PR #67). Всего
231 коммит, 565 файлов (+67942/−2939). Правила процедуры — `CLAUDE.md`,
раздел «Audit Checkpoints».

- Ветка при аудите: `chore/daily-check-audit` (== `origin/fix/pre-pilot-shortlist`,
  `9bdc3fc`).
- Синхронизация: с `origin/fix/pre-pilot-shortlist` — up to date. С `origin/main`
  прод-ветка впереди на весь диапазон (прод обновляется с
  `fix/pre-pilot-shortlist`, переезд на `main` не выполнялся — см.
  `docs/DEPLOY_MAIN_SWITCH.md`).
- Некоммиченных изменений на момент аудита нет.

## 1. Статус сборки и проверок

| Проверка | Команда | Результат |
|---|---|---|
| Типы | `npx tsc --noEmit` | ✅ без ошибок |
| Тесты | `npm test` | ✅ 62 файла, 535/535 |
| Lint | `npm run lint` | ✅ без новых находок (8 заморожено в baseline) |
| Сборка | `npm run build` | ✅ compiled successfully, 44/44 static pages |

## 2. Что менялось в диапазоне (по слоям)

**Auth/сессия и роли.** Вход staff в свои кабинеты (#9–#14), кабинеты
владельцев (#11), сессия бариста и профиль (#21–#25), `/admin` по роли `admin`
с удалением Basic Auth (#31–#33), гейты `requireStaffRole`/`requireAdminApi`.
Финальный блок — главная и меню по состоянию сессии для 5 ролей + middleware
обновления токена (#65–#67).

**Партнёры и данные.** Партнёры читают/пишут `coffee_shops`/`roasters` в БД:
активация, реестр, карта (#58), заявка XO находится по id (#61).

**Персональные данные / «только Россия».** Аудит внешних доменов +
`scripts/ops/redact.mjs` (#41); тайлы OSM через свой nginx с кэшем, Nominatim
только с сервера (`/api/cafe/geocode`), «Маршрут» — Яндекс (#44–#47).

**Дегустация и путешествие.** Путь «магазин» после QR + флаг
`profile_seen_before_tasting` (#12–#13, #15, #17–#20), отложенный каппинг
(#18), дегустация гостя — community-слой (миграции 0026/0031) и contextual
taste.

**Инфраструктура и CI/CD.** HTTPS на домене с 301 (#29), health-check входа
админа (#35), верификационные workflow'ы (`verify-session-state`,
`verify-admin-access`, `verify-barista-access`, `verify-external-domains`,
`verify-home-colors`), `db-migrate` и `server-ops` через Actions.

**Прочее фичи.** Домашние цвета и блок «Четыре философии» (#27, #63),
barista-аккаунты из кабинета кофейни (#21–#25), лояльность/ранги (#—),
events-пайплайн с cron-архивацией, canonical lot lifecycle, уведомления.

Миграции в диапазоне: 0014 (events), 0020 (fix PIR-дат), 0026/0031 (community),
0033 (cron RPC service_role only), 0035 (`profile_seen_before_tasting`) и
ряд других 0005–0035.

## 3. Spot-check жёстких гейтов (CLAUDE.md:105–119)

| # | Гейт | Проверка | Итог |
|---|---|---|---|
| 1 | Секреты только на сервере | grep `SERVICE_ROLE`/`XO_*_SECRET` × `NEXT_PUBLIC` по `app/ components/ lib/` — совпадений нет (только комментарий в `xoAdmin.ts` о запрете) | ✅ |
| 2 | `/admin` по роли | `app/admin/layout.tsx:7` — `requireStaffRole('admin', '/admin')`; `lib/auth/requireAdminApi.ts` на API | ✅ |
| 4 | `next=` только через `safeNextPath` | `app/auth/callback/route.ts:3` + allowlist публичных хостов (11 строк) | ✅ |
| 5 | Интеграции fail-closed | `lib/integrations/xoStoreAuth.ts:10` — `if (!secret) return false` | ✅ |
| 6 | Схема/RLS — только новыми миграциями | см. находку F-1 (правка seed-данных 0014, обоснованная) | ⚠️ low |
| 8 | cron RPC — только service_role | `supabase/cronRpcGrants.test.ts` на месте, миграция 0033 в диапазоне | ✅ |
| 9 | Данные только в России, redact | `server-ops.yml:34–36` — весь вывод через `redact.mjs` | ✅ |

Гейты 3 и 7 автоматической проверкой не покрыты (тесты `requireStaffApi`,
`safeRedirect` — на месте, в диапазоне не менялись); вручную не перепроверялись
— без изменений в диапазоне.

## 4. Находки

**F-1 (low, accepted).** `b1796b9` (2026-09-04) отредактировал старую миграцию
`0014_events_module.sql` (даты PIR Coffee/Expo 13–16 → 26–29 октября) вместе
с добавлением forward-миграции `0020_fix_pir_event_dates.sql`. Отклонение от
гейта 6, но обоснованное в сообщении коммита: `0014` уже исполнена на проде,
seed-INSERT не может исправить живые данные — нужна была 0020; правка 0014
синхронизирует свежие инсталляции. Затронуты seed-данные, не схема/RLS.
Отдельной задачи не требует.

**F-2 (known, не исправлять в рамках аудита).** Две находки 2-го раунда Codex
из задачи `20261028-1700-home-session-state`
(`.agents/runs/20261028-1700-home-session-state/report-2.md`):
проверка кабинета в `deploy/timeweb/verify-session-state.py:113` принимает
пустую страницу баристы (HTTP 200 без содержимого) за PASS; проверка меню в
`scripts/ops/verify-session-state.cjs:146` допускает лишние личные пункты.
Severity: medium, открыты сознательно — владелец включил их в список известных.

## 5. Checkpoint

Сборка и все проверки зелёные, некоммиченных изменений нет → `.last_audit`
обновлён на `9bdc3fcf09fe1dbd632d8fc315f7787bd16a03ae` (HEAD на момент аудита).

## 6. Замечания к процедуре

- Предыдущий формальный аудит — 2026-08-31; диапазон вырос до 231 коммита.
  Рекомендуется не откладывать «Daily Check» дальше чем на 2–3 задачи.
- Аудит НЕ покрывает прод-инфраструктуру (workflow `verify-external-domains`,
  `verify-session-state` на живом проде) — они запускаются отдельно владельцем.
