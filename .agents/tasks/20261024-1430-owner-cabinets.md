# 20261024-1430-owner-cabinets

Цель: владелец входит по email+паролю в кабинеты админа, обжарщика и кофейни.
Автор: Claude (маршрутизация входа — логика; workflow и серверный скрипт идут одним PR, потому что вся работа с паролями — одна цепочка; так же сделано в 20261024-deploy-actions). Ревью — Codex.

## Схема (что выяснено)
- Роль — `profiles.role` (`enthusiast | barista | cafe_admin | roaster_admin | admin`), строку создаёт триггер `handle_new_user_profile` с ролью `enthusiast`.
- Привязки: `profiles.roaster_id` = `roasters.slug`, `profiles.cafe_id` = `coffee_shops.slug` (0022); проверка формы — `profiles_role_scope` (0009): admin без привязок.
- Кабинеты: `/dashboard/admin|roaster|cafe|barista`, вход проверяет `requireStaffRole`. `/admin` — отдельная CRM под Basic Auth, не трогаем.
- Форма входа (`EnthusiastAuthForm` → `signInWithPassword`) всегда вела на `next`: `/journey` с главной, `/` с `/auth/login`. Роль не учитывалась.

## План
1. `signInWithPassword`: если `next` — `/` или `/journey`, читать роль из `profiles`; staff → свой кабинет. Явный `next` и энтузиаст — как раньше. Форму и регистрацию не трогать. Тесты сначала красные.
2. `.gitignore`: `/.secrets/`; локально `.secrets/cabinet-credentials.txt`, пароли 24 символа (crypto.randomInt).
3. `deploy/timeweb/provision-cabinets.py`: на сервере, Admin API GoTrue + PostgREST с service_role из `.env.local`; inspect / apply (email_confirm, upsert профиля, проверка slug) / temp-create / temp-delete. Пароли только stdin, в вывод не идут.
4. `.github/workflows/provision-cabinets.yml`: только вручную; inspect → apply → вход через настоящую форму (Playwright на раннере) тремя учётками и временным энтузиастом → удаление энтузиаста.
5. После прогона — удалить секреты `CABINET_*`.

## Критерии готовности
- `npm test` (файл actions.test.ts), `tsc`, lint — зелёные; новые тесты были красными без фикса.
- Лог apply: PASS для admin → `/dashboard/admin`, roaster → `/dashboard/roaster`, cafe → `/dashboard/cafe`, энтузиаст → `/` и `/journey`, HTTP 200.
- `git check-ignore .secrets/cabinet-credentials.txt` — путь игнорируется.
- `gh secret list` без `CABINET_*`.
- site-health: fails 0.

## НЕ трогать
`EnthusiastAuthForm.tsx`, регистрацию (`signUpWithPassword`), главную, `/admin` и Basic Auth, миграции.
