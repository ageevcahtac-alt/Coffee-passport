# Claude Final Implementation Review

Дата: 3 октября 2026. Ветка `fix/pre-pilot-shortlist`, HEAD `3a266ba` (коммитов поверх `main` нет, все изменения Codex лежат в рабочем дереве).
Основание: `docs/audits/CODEX_PRELAUNCH_AUDIT.md`, `docs/audits/CLAUDE_REVIEW_OF_CODEX.md` (FINAL PRE-PILOT SHORTLIST и CODEX CORRECTION BRIEF), `docs/audits/CODEX_PREPILOT_IMPLEMENTATION_REPORT.md`.

Режим: только чтение. Код, БД/Supabase, `.last_audit`, git-история и deployment не изменялись. Commit и push не выполнялись. Единственный созданный файл — этот отчёт. Сборка оставила только git-ignored артефакты `.next/`.

Как проверялось: построчный `git diff` всех 21 изменённых tracked-файлов, полное чтение двух новых исходников (`lib/auth/requireAdminBasicAuth.ts`, `app/admin/layout.tsx`) и названий новых тестов. Каждое изменение сверялось с окружающим кодом, миграциями (RLS, CHECK-ограничения, FK), `middleware.ts`, `render.yaml`, `lib/auth/currentUser.tsx`, `lib/data/lotsStore.ts`, `lib/data/cafeMenuStore.ts`, `lib/utils/lotId.ts`. Все проверки из раздела VERIFICATION RESULTS я запускал сам.

---

## ACCEPTED

Каждый пункт shortlist реализован в пределах brief. Расширения scope, изменений архитектуры, схемы БД и миграций нет.

### A1 — Next.js 14.2.0 → 14.2.35
- `package.json`: `"next": "14.2.35"` (точная версия). В lockfile изменились только `next`, `@next/env` и `@next/swc-*`. SWC 14.2.33 — это зависимость, которую объявляет сам `next@14.2.35`, а не рассинхрон.
- Проверено `npm view`: 14.2.35 — последний опубликованный патч линии 14.2.x. Мажорного апгрейда нет, React/Tailwind не тронуты.
- Исходный повод P0-01 (обход middleware через `x-middleware-subrequest`) этой версией закрыт. Про оставшиеся advisories — в SECURITY REVIEW.

### A2 — независимая проверка Basic Auth внутри admin handlers
- `lib/auth/requireAdminBasicAuth.ts`:
  - строгий разбор `Basic <base64>`, логин и пароль делятся по первому `:` (пароль с двоеточием работает);
  - сравнение через SHA-256 и `crypto.timingSafeEqual`: время не зависит от длины, исключений из-за разной длины нет;
  - **fail-closed**: если `ADMIN_PASSWORD` пуст или не задан, всегда 401;
  - ответ 401 с тем же `WWW-Authenticate`, что и в middleware.
- Guard стоит **первой строкой** в `GET /api/admin/partner-requests` и `PATCH /api/admin/partner-requests/[id]`, то есть до `request.json()` и до `createAdminSupabaseClient()`. Других `/api/admin/**` маршрутов в проекте нет (проверено `find`).
- `app/admin/layout.tsx` — серверный `force-dynamic` layout: при отказе делает `redirect('/')` и не рендерит детей. Layout не может вернуть 401, поэтому HTTP-challenge по-прежнему выдаёт middleware. Решение корректное.
- Guard не попадает в клиентский бандл (поиск `requireAdminBasicAuth`/`timingSafeEqual` по `.next/static` → 0 файлов).
- Устаревший комментарий в `app/admin/page.tsx` исправлен.
- Попутный плюс: сам `middleware.ts` при незаданном `ADMIN_PASSWORD` фактически fail-open (`"admin".split(':')` даёт `pwd === undefined === validPassword`). Это проблема исходного кода, а не Codex. Новый guard её нейтрализует: данные и страница теперь закрыты независимо от middleware.

### A3 — demo-доступ: кодовая часть, безопасная для текущих пилотных сотрудников
- `app/layout.tsx` и `DevRoleSwitcher.tsx`: вся панель, включая «Энтузиаст» и «Админ», рендерится только при `NEXT_PUBLIC_PILOT_DEMO_ENABLED === 'true'`. Ранний `return null` стоит после хуков, правила хуков не нарушены: флаг — build-time константа.
- **Отказ Codex менять `render.yaml` и убирать литерал demo-пароля сейчас я считаю правильным, а не недоработкой.** `render.yaml` задаёт `branch: main` и `autoDeploy: true`. Если в этой ветке выключить флаг или перевести пароль на незаданный env, первый же merge в `main` автоматически отрежет сотрудников XO, которые входят через панель. В текущем виде ветка **нейтральна для перехода**: на Render флаг `true`, после merge панель и demo-вход работают как раньше. Изменения нужно делать в отдельном PR в момент перехода (см. DEMO → REAL ACCOUNTS TRANSITION).
- Codex явно пишет, что UI-gate не является защитой DB/RPC. Это верно и честно.

### A4 — `/api/barista/[id]` отдаёт только опубликованные рецепты
- К запросу рецептов добавлен `.eq('is_public', true)` поверх уже существующего author-scope. Комментарий про anon key заменён на правильный: service-role обходит RLS. Есть тест.

### B1 — молоко «Не знаю»
- `isDrinkSelectionComplete`: для `cow` тип и жирность больше не обязательны. Выбор основы молока по-прежнему обязателен, у `plant` по-прежнему обязательно название.
- `MilkBaseSelector`: в оба вопроса добавлены «Не знаю» (выбор оставляет `null`) и подписи «можно пропустить». Существующие варианты сохранены.
- Сверено с БД: `checkins_cow_milk_type_check` и `checkins_fat_content_percent_check` (`0021`) явно допускают `null`, поэтому облачная запись не упадёт. Тип `DrinkSelection` уже объявлял оба поля как `| null`, так что type guard остался честным. `describeMilkBase` пропускает `null`.
- Наблюдение (не дефект): поле по умолчанию `null`, поэтому «Не знаю» подсвечен сразу при выборе коровьего молока. Это совпадает со смыслом «можно пропустить».

### B2 — «Назад» с шага бариста сохраняет ввод
- `TastingForm` принимает `initialValues`, все 16 `useState` инициализируются из него, а без него — прежними значениями по умолчанию. Страница передаёт `pendingTasteValues ?? undefined`. Состав и порядок формы не менялись.

### B3 — каталог лотов в `/journey`
- `void syncLotsFromSupabase()` при монтировании, плюс `useLots()` в родителе ради подписки. `CoffeeJourney` и страница вызывают `getMergedLotById` прямо в render без `useMemo`, поэтому после sync всё пересчитывается. Фильтр истории по текущему `userId` сохранён.

### B4 — сканеры
- `/scan`: сразу `router.push('/passport/' + lotId)` без проверки по замкнутому кэшу. Неизвестный id обрабатывает сам паспорт. Сверено: `extractLotId` возвращает id в верхнем регистре, а `generatePublicLotId` (`lib/server/canonicalLot.ts`, `lib/data/lotsStore.ts`) всегда генерирует верхний регистр, поэтому регрессии по регистру при отказе от case-insensitive `find` нет.
- `ScanLotModal`: оба sync (`syncLotsFromSupabase` и `syncCafeMenuFromSupabase`) запускаются при монтировании, resolve их дожидается и читает свежий снапшот (`getMergedLotById`, `getMenuLotIds`). Обе sync-функции перехватывают ошибки и никогда не отклоняются, поэтому `await` не зависнет и не даст unhandled rejection. Проверка «нет в меню кофейни» сохранена для известных лотов. Неизвестный локально лот передаётся паспорту.
- `QrScanner`: `onDecode`/`onError` хранятся в refs (stale closure устранён), `resetKey` сбрасывает `decodedRef` и перезапускает RAF на том же stream без повторного `getUserMedia`. В `tick` добавлен `cancelled`, cleanup сохранён. Кнопка «Сканировать ещё раз» показывается при ошибке.

### B5 — ошибка входа видна гостю
- `errorRedirect` проходит через `safeNextPath`. Новый `authErrorPath` собирает URL через `URL`/`searchParams` (`next` и `error` — отдельные параметры) и повторно проверяет origin, что закрывает нормализацию `/\host`. Применён и в login, и в signup. Потребители (`/auth/login` с `?next=…`, форма на `/` с `errorRedirect='/'`) читают `searchParams.error` — сверено.

### B6 — минимальная надёжность облачного сохранения
- `syncCheckinsForUser`: после успешного pull одним `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` дозагружаются локальные записи **только** с `record.userId === userId`, которых нет на сервере. Серверная копия имеет приоритет. В анонимном режиме ничего не отправляется (ранний `return`). Ошибка — `console.warn`, локальные данные сохраняются.
- Безопасность RLS сверена: политика `"owner manages own checkins"` (`0007`) — `for all … with check (auth.uid() = owner_user_id)`. Для `INSERT … ON CONFLICT DO NOTHING` достаточно insert-проверки, поэтому чужую запись загрузить или перезаписать нельзя.
- Риска «воскрешения» удалённых записей нет: в коде нет ни одного `delete` по `checkins` (проверено grep).
- Переключение аккаунта: записи уходящего пользователя **паркуются** в отдельный ключ `coffee-passport:journey:user:<id>`, который не входит в `getSnapshot`, и восстанавливаются только при возвращении того же владельца с фильтром по `userId`. Если сохранить отдельную копию не удалось, работает прежний purge (приоритет приватности). Это ровно тот вариант, который brief разрешил («записи остаются в изолированном виде, недоступном текущему пользователю»).
- Гонки закрыты: поздний pull после смены/выхода игнорируется (`resolvedScopeUserId` и `ACTIVE_USER_KEY`), поздний reference lookup обновляет припаркованную запись и не пишет её под чужой сессией, у первоначального insert появился `.catch`.
- Outbox, очередей и UI-статусов нет. `cuppingsStore` не тронут. `isPublic:false` и reference не меняются.

### C1, C2
- `<html lang="ru">`.
- `FarmerPinningModal`: `max-h-[calc(100dvh-3rem)] overflow-y-auto` на контейнере. Содержимое и CTA не изменены.

### D1–D4
Не реализованы — это допустимо: brief разрешал их только как необязательные.

### Scope и гигиена diff
- Изменены ровно 21 tracked-файл, заявленные в отчёте Codex. Новые файлы: 2 исходника, 9 тестовых файлов, `docs/audits/`. Миграции, `render.yaml`, XO-интеграции, канонический слой, loyalty, roast batches и эталоны не тронуты.
- `git diff --check` чист (есть только предупреждения LF→CRLF). Случайных файлов, конфигов ESLint и мусора нет. Untracked-артефакты в корне — прежние, Codex их не трогал.

---

## NEEDS CORRECTION

**Подтверждённых дефектов реализации Codex, которые требуют исправления до пилота, нет.**

Ниже — мелкие наблюдения. Ни одно не блокирует пилот и не требует отдельного цикла правок. Их можно учесть попутно в PR перехода A3 или после пилота.

1. **Расхождение fallback для `ADMIN_USER`.** Helper использует `process.env.ADMIN_USER ?? 'admin'`, middleware — `||`. Если в env задан `ADMIN_USER=""`, middleware ждёт `admin`, а helper ждёт пустую строку, и администратор не войдёт. Это fail-closed, не уязвимость. Исправление: `||` в helper (`lib/auth/requireAdminBasicAuth.ts`).
2. **Паркуются все записи уходящего аккаунта, а не только неподтверждённые сервером.** Это упрощение ради отсутствия трекинга подтверждений (brief разрешал «самый простой вариант»). Следствие: на общем устройстве приватные заметки аккаунта A остаются в localStorage, пока A не войдёт снова. В UI аккаунта B они недоступны. До изменения Codex они точно так же лежали в localStorage после выхода A, вплоть до входа B. Приемлемо для пилота.
3. **Одна «ядовитая» запись блокирует batch-upsert.** Если какая-то локальная запись постоянно нарушает ограничение БД, upsert всего набора будет падать при каждом sync. Сейчас таких записей не видно: `lot_id` — text без FK, молочные CHECK допускают `null`. Это гипотетический риск, после пилота при необходимости можно перейти на поштучную отправку.
4. **`ScanLotModal`:** если QR декодируется, пока идёт ручной resolve (`resolvingRef`), колбэк молча выходит, а сканер остаётся на `decodedRef = true` без кнопки повтора. Нужна одновременная ручная отправка и скан — практически недостижимо. P3.

---

## REGRESSIONS

**Регрессий не обнаружено.**

- Все 223 прежних теста проходят без изменений. Codex не переписывал старые test-файлы (проверено: изменённые tracked-файлы — только исходники).
- Сознательные изменения поведения, согласованные в brief:
  - `/scan` больше не говорит «Лот не найден» на произвольный текст, а открывает паспорт с состоянием неизвестного лота;
  - при смене аккаунта история паркуется, а не удаляется;
  - при выключенном флаге скрываются кнопки «Энтузиаст» и «Админ».
- Текущий живой сценарий сотрудников XO через demo-панель после merge не изменится: на Render флаг `true`.
- Сборка: все маршруты, кроме `/map`, и раньше были dynamic, потому что `app/(site)/layout.tsx` читает cookies. Новый `force-dynamic` у `/admin` ничего существенного не меняет.

---

## SECURITY REVIEW

| Область | Итог |
|---|---|
| Admin API (GET/PATCH) | **Закрыто.** Независимый fail-closed guard внутри handler, до чтения body и создания service-role клиента. Тесты вызывают handler напрямую, минуя middleware. |
| Страница `/admin` | **Закрыто.** Серверный layout-guard плюс middleware. Клиентский JS страницы данных не содержит, данные идут только через защищённый API. |
| Обходы admin authorization | Других `/api/admin/**` маршрутов нет. Исходный middleware-bypass закрыт версией 14.2.35. Fail-open middleware при пустом `ADMIN_PASSWORD` нейтрализован guard'ом. |
| Open redirect в auth | **Улучшено.** `errorRedirect` проходит через `safeNextPath` и проверку origin после `URL`-парсинга. |
| Публичный barista API | **Закрыто.** Только `is_public = true` и только записи этого автора. |
| RLS / приватность дегустаций | Upsert ограничен записями текущего `auth.uid()`, а RLS `with check` не даёт записать чужие. `isPublic:false` по умолчанию не тронут. Поздние ответы sync после смены аккаунта отбрасываются. Записи ушедшего аккаунта недоступны в UI нового (см. замечание 2). |
| Секреты в бандле | Demo-пароля в `.next/static` нет (0 файлов). Demo-email присутствуют (1 chunk: модуль `PILOT_STAFF_ROLES` остаётся в бандле как dead code) — известно и не критично. Admin guard не в клиенте. |
| **Demo privileged path (P0-02 / M-1)** | **ОТКРЫТ на живом сайте.** Кодовые изменения его не закрывают и не должны были: на Render `NEXT_PUBLIC_PILOT_DEMO_ENABLED="true"`, в БД `pilot_demo_enabled=true`, demo-пароль лежит в git. Пока переход не завершён, **любой посетитель может войти как `cafe_admin` кофейни `shop-xo-vsevolozhsk` и прочитать все приватные дегустации её гостей** (RLS `"shop staff read own shop checkins"`). Причём даже с выключенным флагом уже созданные `*@test.com` с назначенными ролями остаются доступны через Supabase Auth API (публичный anon key + пароль из git). Поэтому реально закрывает дыру шаг «понизить роли и сменить пароли demo-аккаунтов», а не флаг. Порядок — в следующем разделе. |
| **Next.js 14.2.35 — остаточные advisories** | `npm audit --omit=dev`: для `next` 23 advisory, исправленных только в 15.5.x. Для этого приложения применимы: DoS через Server Actions и RSC (GHSA-m99w-x7hq-7vfj, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj, GHSA-h25m-26qc-wcjf — App Router и server actions используются), раскрытие endpoints server functions (moderate), RSC cache poisoning (moderate). **Новое наблюдение:** `next.config.js` разрешает `images.remotePatterns` с `hostname: '**.supabase.co'`, то есть **любой** проект Supabase, включая проект атакующего. Через это Image Optimizer достижим извне: GHSA-9g9p-9gw9-jx7f и GHSA-h64f-5h5j-jqjh (DoS), а AVIF-RCE GHSA-2xp9-vwfh-vxw4 зависит от декодера. Неприменимы: Windows-RCE (хостинг Linux), Pages Router i18n, custom server, WebSocket. Ни одна из этих проблем не регрессия Codex. Ограничение «только 14.2.x» поставил мой brief. Решение — за владельцем (см. RELEASE READINESS). |

**Итог по security:** реализация Codex корректна, обходов admin-авторизации не осталось, RLS и приватность не нарушены. Живой сайт **небезопасен для гостей**, пока не завершён переход demo → реальные аккаунты. Для закрытого пилота с одной кофейней остаточные DoS-advisories Next 14.2 — принимаемый риск. Для публичного запуска — нет.

---

## DEMO → REAL ACCOUNTS TRANSITION

Факты, на которых построен порядок:
- `dev_seed_staff_profile()` (`0029`) назначает роли только при `pilot_demo_enabled=true`, но **уже назначенные роли** demo-аккаунтов остаются в `profiles` независимо от флага.
- `requireStaffRole` и RLS читают роль из `profiles` на каждом запросе. Значит, понижение роли действует **сразу**, без ожидания истечения JWT.
- `render.yaml`: `branch: main`, `autoDeploy: true`. Любой merge в `main` сразу деплоится. `NEXT_PUBLIC_*` подставляется при сборке, поэтому смена env требует пересборки.
- FK на `auth.users`:
  - `reference_taste_profiles`/roast-таблицы `created_by … on delete set null`;
  - `loyalty_transactions.barista_id … on delete set null`;
  - `checkins`, `recipes`, `equipment_garage` `owner_user_id … on delete cascade`.

  **Удаление** demo-пользователей стирает авторство эталонов и баристу в истории лояльности. Кроме того, освободившийся `*@test.com` снова можно зарегистрировать. Поэтому demo-аккаунты **не удалять**, а понижать роль, менять пароль и блокировать (ban).

### Порядок

**Шаг 0. Инвентаризация (только чтение, владелец).**
В Supabase посмотреть `auth.users` с email `*@test.com` и их `last_sign_in_at`, а также `profiles` с `role <> 'enthusiast'`. Уточнить у XO, кто из сотрудников каким кабинетом пользуется: кофейня, обжарщик, бариста, admin/feedback.

**Шаг 1. Реальные аккаунты.**
Каждый сотрудник регистрируется обычной формой `/auth/login` под личным email. Сначала проверить настройку «Confirm email»: если она включена, сотрудник должен подтвердить почту.

**Шаг 2. Назначение ролей вручную (владелец, Supabase SQL editor / Table editor).**
Для каждого реального пользователя в `profiles` выставить `role` и `cafe_id='shop-xo-vsevolozhsk'` / `roaster_id='roaster-xo'` / `barista_id`. Для бариста `barista_id` должен совпадать с его карточкой в `barista_profiles` (demo-бариста привязан к `barista-xo-alexey`).

**Шаг 3. Проверка сотрудниками под новыми аккаунтами.**
Каждый входит под своим аккаунтом и проходит основные действия своего кабинета: меню кофейни, заказы, производство обжарщика, кабинет бариста, лояльность. **Не продолжать, пока все действующие сотрудники не подтвердили вход.** Договориться о времени переключения.

**Шаг 4. Окно переключения: выполнять подряд в одном окне.**
- 4a. БД: `app_settings.pilot_demo_enabled = false`. RPC перестаёт назначать роли.
- 4b. Demo-аккаунты (все четыре `*@test.com`):
  - `profiles.role = 'enthusiast'`, `cafe_id/roaster_id/barista_id = null` — **это и есть момент фактического закрытия утечки**;
  - сменить пароль на случайный;
  - заблокировать пользователя (ban) и завершить его сессии (sign out / revoke refresh tokens через Supabase Admin).

  После 4b demo-панель на живом сайте ещё видна, но клик даёт ошибку входа: пароль не совпадает, а signUp откажет, потому что пользователь уже существует. Роль получить нельзя.
- 4c. Проверка: под старым demo-паролем войти нельзя; реальные сотрудники по-прежнему видят свои кабинеты.

**Шаг 5. Код и env (PR перехода — см. FINAL CODEX CORRECTION BRIEF, часть 1).**
- В Render dashboard удалить `NEXT_PUBLIC_PILOT_DEMO_ENABLED` или поставить `false`.
- Смержить PR перехода: `render.yaml` без флага, `pilotStaff.ts` без литерала пароля. Merge запускает autoDeploy, то есть пересборку.
- Проверить, что в HTML нет Dev-панели, а прямой POST `signInAsPilotStaff` ведёт на `/`.

**Шаг 6. Только после шагов 4–5 пускать гостей пилота** (или продолжать пускать, если гости уже есть: тогда шаги 1–5 выполнить как можно раньше).

**Шаг 7. После пилота (отдельной миграцией, не сейчас):**
`revoke execute on function public.dev_seed_staff_profile() from authenticated` или `drop function`. Отдельно — переход на Next 15.5.x.

**Чего не делать:**
- не выключать флаг и не менять demo-пароли до шага 3 — это отрежет кофейню и обжарщика;
- не удалять demo-пользователей;
- не мержить в `main` изменение `render.yaml` раньше шага 4 — autoDeploy.

---

## VERIFICATION RESULTS

Все команды запущены мной в рабочем дереве ветки `fix/pre-pilot-shortlist` (Windows, локальный Node).

| Проверка | Результат |
|---|---|
| `npx tsc --noEmit --incremental false` | **PASS** (exit 0, без ошибок) |
| `npm test` (vitest) | **PASS**: 32 файла, **278 тестов**, exit 0. Совпадает с отчётом Codex (было 23/223, добавлено 9 файлов / 55 тестов) |
| `npm run build` | **PASS**: Next 14.2.35, «Compiled successfully», 38/38 static pages, `/admin` — dynamic (ƒ), exit 0 |
| `npm run lint` | **НЕ ВЫПОЛНЕН**: `next lint` запускает интерактивную первичную настройку ESLint (конфига в проекте нет). Выход по EOF, файлы не созданы. Известный P3, вне scope |
| `git diff --check` | PASS (только предупреждения LF→CRLF) |
| `npm view next` (14.2.x) | 14.2.35 — последний патч линии |
| `npm audit --omit=dev` | 4 пакета: `next` (critical), `d3-color` (high), `postcss` во вложенном `next` (high), `dompurify` (low). Для `next` исправлений в 14.x нет |
| Поиск по клиентскому бандлу `.next/static` | demo-пароль: 0 файлов; `requireAdminBasicAuth`/`timingSafeEqual`: 0; demo-email: 1 chunk (dead code) |
| Targeted: RLS/constraints | `checkins` RLS `with check (auth.uid() = owner_user_id)`; молочные CHECK допускают `null`; `lot_id` без FK; `delete` по `checkins` в коде нет |
| Targeted: регистр lot id | `extractLotId` и оба генератора `public_id` используют верхний регистр — прямой переход `/scan` корректен |
| Targeted: отклонение sync-промисов | `syncLotsFromSupabase` и `syncCafeMenuFromSupabase` перехватывают все ошибки — `await` в `ScanLotModal` безопасен |
| Targeted: другие admin-маршруты | В `app/api/admin` есть только `partner-requests` (GET) и `[id]` (PATCH) — оба под guard |
| `git status` | 21 изменённый tracked-файл (список совпадает с отчётом Codex), новые: 2 исходника, 9 тестов, `docs/`. Посторонних изменений нет |

**Не проверено (нужен ручной прогон на устройстве, см. RELEASE READINESS):** реальная камера и разрешения, касания и CSS-раскладка на маленьком экране, регистрация и вход на живом Supabase, восстановление истории на другом устройстве, фактический RLS-отказ. Тесты Codex для сканера и формы используют моки (RAF, getUserMedia, SSR). Они подтверждают логику, но не поведение в браузере.

---

## FINAL CODEX CORRECTION BRIEF

**NO CODE CORRECTIONS REQUIRED** — для реализованного Codex pre-pilot блока. Исправлять в текущем diff нечего, его можно коммитить как есть (логическими коммитами A / B / C, по решению владельца).

Ниже два **отложенных** задания. Это не исправления ошибок Codex, а следующие шаги. Запускать их только по команде владельца.

### Часть 1 — PR перехода A3 (выполнять только на шаге 5, после подтверждения шагов 1–4)
Отдельная ветка от `main`, один коммит, без push до команды владельца:
1. `render.yaml`: удалить `NEXT_PUBLIC_PILOT_DEMO_ENABLED` из `envVars` (или поставить `"false"`).
2. `lib/auth/pilotStaff.ts`: удалить экспорт `PILOT_STAFF_PASSWORD` и литерал. Комментарий о «throwaway fixtures» привести в соответствие.
3. `app/auth/actions.ts` → `signInAsPilotStaff`: пароль брать из server-only `process.env.PILOT_STAFF_PASSWORD`. Если флаг не `'true'` **или** пароль пуст — `redirect('/')` (fail-closed). Остальную логику не трогать.
4. Попутно: `lib/auth/requireAdminBasicAuth.ts` — `process.env.ADMIN_USER || 'admin'` (как в middleware).
5. Тест: `signInAsPilotStaff` при отсутствии `PILOT_STAFF_PASSWORD` редиректит на `/` и не вызывает Supabase.
6. `npx tsc --noEmit`, `npm test`, `npm run build`.

Не создавать миграции, не выполнять SQL, не трогать `dev_seed_staff_profile`.

### Часть 2 — сужение Image Optimizer (только если владелец одобрит; новый scope, а не дефект Codex)
`next.config.js`: заменить `hostname: '**.supabase.co'` на точный хост проекта (из `NEXT_PUBLIC_SUPABASE_URL`), и/или `pathname: '/storage/v1/object/public/**'`. В проекте один файл использует `next/image`. Проверить, что он грузит изображения только из своего проекта. Build + ручная проверка страницы с изображением. Так отключается внешняя достижимость Image Optimizer для advisories DoS/AVIF без мажорного апгрейда.

---

## RELEASE READINESS

Только фактические действия, которые остаются перед пилотом и которые нельзя или не следует выполнять автоматически:

1. **Переход demo → реальные аккаунты, шаги 0–5 из раздела выше.** Это блокер для гостей: до шага 4b приватные дегустации гостей кофейни XO доступны любому посетителю. Выполняет владелец вместе с сотрудниками XO.
2. **Решение владельца по Next.js:** принять остаточные DoS-advisories 14.2.35 на время закрытого пилота (моя рекомендация — допустимо для одной кофейни) и запланировать переход на 15.5.x до публичного запуска. Одобрить или отклонить Часть 2 brief (сужение `remotePatterns`). Заодно принять решение по `npm audit fix` для `d3-color`/`dompurify` (не-мажорные исправления).
3. **Commit текущего diff** (владелец решает, когда; ветка нейтральна для перехода и безопасна для merge при `true` на Render). Push и merge в `main` запускают autoDeploy на Render.
4. **Supabase:** проверить «Confirm email» на живом проекте (влияет на шаг 1 и регистрацию гостей). Site URL и Redirect allowlist для целевого домена.
5. **Timeweb** (при переносе): сборка через `npm ci` по lockfile (Supabase-пакеты объявлены `"latest"`), Node 20 LTS, Linux (не Windows-хостинг — GHSA-p293), HTTPS и reverse proxy. Задать `ADMIN_USER`/`ADMIN_PASSWORD` (без пароля admin закрыт полностью — это ожидаемо). `NEXT_PUBLIC_*` задать до сборки. Настроить редирект со старого домена с сохранением пути `/passport/<id>` для печатных QR.
6. **Ручная приёмка на реальном маленьком телефоне** (не автоматизируется):
   - QR камерой → реальный не-seed лот XO → латте / коровье «Не знаю» → оценка и заметки → бариста → «Назад» (ввод на месте) → сохранить → все кнопки модалки при высоте ~600px и в landscape → регистрация → `/journey` → вход в другом браузере, история и карта с реальным лотом на месте;
   - `/scan` и `ScanLotModal` с тем же реальным лотом, лот вне меню → «Сканировать ещё раз», отказ камеры → ручной ввод;
   - неверный пароль на `/auth/login?next=…` показывает ошибку;
   - офлайн-сохранение → повторный вход → запись появилась в Supabase.
7. **Сброс пароля гостям** — вручную через Supabase dashboard по запросу (UI восстановления не делался, как согласовано).
8. **`.last_audit`** этим ревью не обновлялся: это не Daily Check, а изменения не закоммичены.
