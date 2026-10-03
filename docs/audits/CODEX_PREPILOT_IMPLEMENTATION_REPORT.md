# Coffee Passport — Codex Pre-Pilot Implementation Report

Дата: 1 октября 2026. Основание: полностью прочитанный `docs/audits/CLAUDE_REVIEW_OF_CODEX.md`, FINAL PRE-PILOT SHORTLIST / CODEX CORRECTION BRIEF. Ветка: `fix/pre-pilot-shortlist`, исходный HEAD: `3a266baf544e4031c1968b80807c43fdd2cc8d66`.

## Статус

Выполнены A1, A2, A4, B1–B6, C1–C2 и UI-gate части A3. **A3 не завершён:** отключение Render demo-флага и перенос demo-пароля в server-only env отклонены автоматической проверкой безопасности из-за риска отрезать действующих пилотных сотрудников до создания реальных staff-аккаунтов. Вопрос о готовности перехода и разрешении подготовить изменения без deployment отправлен владельцу; ответа на момент составления нет. Флаг и credential path оставлены действующими. Живая БД и deployment не изменялись.

Это отчёт о подготовленных локальных исправлениях, а не подтверждение безопасности текущего живого сайта или разрешение публичного запуска. Требуется завершение операционного перехода A3. Кроме того, ограниченная brief версия Next 14.2.35 закрывает исходный middleware issue, но не все актуальные security advisories; подробности ниже.

Commit/push не выполнялись. `.last_audit`, исходный аудит и review Claude не изменены. Существующие untracked-артефакты сохранены. Отвергнутые предложения не возвращены: нет redesign формы/главной, outbox, UI sync-status, nullable sliders, reset-password UI, облачных каппингов, схемных изменений или Next 15. D1–D4 не реализованы: brief разрешает их только после завершения A–C.

## Реализация по пунктам

### A1 — Next.js в пределах 14.2.x

`next` обновлён с 14.2.0 до **14.2.35** и зафиксирован точно. Это последний опубликованный патч 14.2.x по `npm view next@14.2 version --json` в момент работы. Обновлён lockfile: только Next, `@next/env` и соответствующие SWC-пакеты (SWC 14.2.33 — зависимость самого Next 14.2.35, не ошибка рассогласования). `eslint-config-next` в проекте отсутствует, не добавлялся. Supabase `latest` декларации не переписывались; целевой install — `npm ci`.

Файлы: `package.json`, `package-lock.json`. Production build проходит на 14.2.35. Мажорные версии React/Next/Tailwind не менялись.

### A2 — независимый Basic Auth boundary

Добавлен Node/server-only helper `lib/auth/requireAdminBasicAuth.ts`. Он проверяет scheme/структуру заголовка, разделяет login/password по первому двоеточию, сравнивает оба значения через SHA-256 digests и `crypto.timingSafeEqual`. Отсутствующий/пустой `ADMIN_PASSWORD` всегда даёт отказ. Ответ — 401 с существующим Basic challenge. Guard не импортирован в Edge middleware или client UI.

Admin GET и PATCH вызывают guard до body parsing и создания service-role клиента. Добавлен dynamic server layout `/admin`: независимо от middleware проверяет `headers()` и при отказе перенаправляет на `/`, не рендеря детей. Layout не может возвращать `NextResponse`; обычный HTTP challenge по-прежнему обеспечивает неизменённый middleware. Staff Supabase guards сохранены.

Файлы: helper, `app/api/admin/partner-requests/route.ts`, `app/api/admin/partner-requests/[id]/route.ts`, `app/admin/layout.tsx`, комментарий `app/admin/page.tsx`.

Тесты: прямые вызовы GET/PATCH без middleware — missing/wrong/malformed credentials, отсутствие пароля, успешные credentials, пароль с двоеточием; отсутствие обращения к service-role client при отказе. Отдельно server layout принимает/отказывает независимо от middleware.

### A3 — demo-доступ: частично, переход заблокирован

Root layout рендерит DevRoleSwitcher только при `NEXT_PUBLIC_PILOT_DEMO_ENABLED === 'true'`; компонент имеет тот же общий gate. При выключенном флаге скрывается вся панель, включая навигационные кнопки. При существующем `true` demo-доступ сохраняется. UI-gate не выдаётся за DB/auth защиту.

Файлы: `app/layout.tsx`, `components/dev/DevRoleSwitcher.tsx`.

**Не выполнено:** изменение `render.yaml`, удаление литерала demo-пароля из `pilotStaff.ts` и чтение server-only `PILOT_STAFF_PASSWORD` в action. Общий пакет этих изменений был отклонён auto-review; он не применился. Выполнена безопасная часть, не отключающая действующий флаг. Значение credential намеренно не приводится в отчёте.

**Не выполнено и не должно выполняться этим coding scope:** SQL, создание real staff accounts, смена паролей/ролей demo-пользователей. Текущий operational P0 остаётся, пока владелец не выполнит порядок перехода ниже. Скрытие UI само по себе не закрывает прямой RPC и уже выданные роли.

### A4 — опубликованные рецепты публичного barista API

В `app/api/barista/[id]/route.ts` добавлен `eq('is_public', true)` к scoped author query. Комментарий теперь прямо описывает service-role client и необходимость фильтра. Unit-тест содержит опубликованный, unpublished и чужой author recipe; ответ включает только опубликованный рецепт нужного автора. Приватные строки живой БД не читались.

### B1 — молочные параметры можно не знать

Для коровьего молока `isDrinkSelectionComplete` больше не требует type/fat. В обоих вопросах появились явные «Не знаю» с сохранением `null` и подписи «можно пропустить». Milk base остаётся обязательным; plant milk по-прежнему требует названия. Существующие варианты сохранены. `describeMilkBase` опускает неизвестные подробности; schema менять не понадобилось.

Файлы: `lib/types/coffee.ts`, `components/coffee/MilkBaseSelector.tsx`. Четыре unit-теста проверяют полноту и summaries.

### B2 — черновик при возврате из barista

`TastingForm` принимает optional `initialValues` и инициализирует из него все state fields. Taste page передаёт `pendingTasteValues ?? undefined`. Новая дегустация имеет прежние defaults; состав и порядок формы не изменены.

Файлы: `components/coffee/TastingForm.tsx`, `app/(site)/passport/[lotId]/taste/page.tsx`. Два SSR regression-теста проверяют восстановленные рейтинг/заметки/оси и прежние defaults. Это не браузерный tap-тест.

### B3 — каталог при возвращении в `/journey`

При mount запускается `syncLotsFromSupabase`. Родитель подписан через `useLots`, поэтому все вычисления карты/истории, использующие синхронный lookup, пересчитываются после поступления каталога. `CoffeeJourney` не переписывался. История по-прежнему фильтруется по текущему user id.

Файл: `app/(site)/journey/page.tsx`. Regression-тест проверяет mount sync, подписку и появление map pin для remote/non-seed лота после обновления; запись другого пользователя исключена.

### B4 — свежие данные и повтор сканирования

`/scan` после извлечения id сразу открывает паспорт; seed/cache не используется для отклонения кода. `useLots` остаётся только для существующей demo-подсказки. Паспорт сам загружает scoped row и показывает unknown state.

ScanLotModal запускает catalog/menu sync вместе, ждёт завершения обеих операций и читает текущий store lookup. Проверка меню известного лота сохранена для существующей пилотной точки. Неизвестный локально id передаётся паспорту, а не блокируется seed-кэшем. Ref исключает параллельные resolve. После ошибки доступна кнопка повторного сканирования.

QrScanner вызывает актуальные `onDecode`/`onError` через refs. `resetKey` сбрасывает decode-флаг и возобновляет RAF-loop с тем же camera stream. Смена callback не перезапускает камеру; cleanup сохранён.

Файлы: `app/(site)/scan/page.tsx`, `components/coffee/ScanLotModal.tsx`, `components/coffee/QrScanner.tsx`. Пять scanner regression-тестов + B3 test в `ScannerFlow.test.ts`: non-seed direct navigation, ожидание обеих sync, свежий lookup, fallback, menu refusal/retry, fresh callback/reset без повторного getUserMedia. Камера/RAF/React hooks имитированы, не реальный телефон.

### B5 — ошибка login/signup отдельно от next

Обе password actions пропускают `errorRedirect` через `safeNextPath`, используют общий `authErrorPath` с URL/searchParams и возвращают только pathname+search. Уже существующий next сохраняется, error — отдельный параметр. Дополнительная проверка origin закрывает URL-нормализацию backslash-адреса.

Файлы: `app/auth/actions.ts`, `lib/auth/safeRedirect.ts`. Четыре helper-теста и шесть action-тестов проверяют login/signup errors, внешний target и сохранение успешного return path. Signup confirmation/recovery не расширялись.

### B6 — retry на существующей синхронизации

После успешного authenticated pull локальные записи этого user id, отсутствующие в ответе, отправляются одним upsert с `onConflict:'id', ignoreDuplicates:true`. Ошибки логируются, локальная копия остаётся для следующего sync. Anonymous mode ничего не отправляет. Серверная версия существующего id имеет приоритет. Rejected первоначальный insert также обработан, без unhandled rejection.

При смене аккаунта его tasting cache паркуется в отдельный localStorage key, отсутствующий в общем snapshot, и восстанавливается только при возвращении владельца. Это изолированная копия существующего read cache, а не outbox/очередь. Остальные stores сохраняют прежний purge. Поздний pull после switch/logout игнорируется; поздний reference lookup обновляет припаркованную запись и не пытается записать её под чужой сессией. `isPublic:false` и historical reference не меняются.

Если storage не может сохранить отдельную копию (quota/private mode), выполняется прежний purge с warning: приватность приоритетна, неотправленная запись может потеряться. Если durable write при восстановлении не удался, parked key не удаляется. Это оставшееся ограничение browser storage, не обещание гарантированной доставки.

Файлы: `lib/journey/store.ts`, `lib/journey/userScope.ts`. 14 новых tests: missing/existing ids, owner scope, anonymous no-op, pull failure, returned/thrown upload errors и retry, failed claim, переключение/возврат, malformed partition, storage failure, late pull/scope, late reference, rejected save.

### C1–C2 — мобильная гигиена

`html lang="ru"`; success modal content ограничен `max-h-[calc(100dvh-3rem)] overflow-y-auto`, без изменения содержимого и CTA. `app/layout.tsx`, `components/coffee/FarmerPinningModal.tsx`.

HTTP HTML подтверждает русский lang и отсутствие Dev-панели при локально выключенном флаге. Достижимость всех CTA на реальном маленьком телефоне требует ручной проверки.

## Проверки

| Команда / проверка | Результат |
|---|---|
| `npm test` после исправлений | PASS, 32 files / 278 tests (исходно 23 / 223; добавлено 55) |
| `npx tsc --noEmit --incremental false` | PASS, включая финальный повтор после добавления B3 test |
| `npm run build` | PASS, Next 14.2.35, 38/38 static generations, dynamic `/admin` |
| `npm run lint` | Exit 1: интерактивная первоначальная настройка ESLint; lint не прошёл и не выполнен. Настройка вне shortlist, не создана |
| `npm audit --json` | 9 vulnerable entries: low 1 / moderate 3 / high 3 / critical 2; не считать security-clean |
| `git diff --check` | PASS; только уведомления LF/CRLF |
| HTTP smoke на production runtime | Public guest routes 200; `/admin` и admin GET/PATCH 401 без credentials; cafe dashboard 307; cafe API 401 |

Build предупреждает об optional `sharp`; он не добавлялся. Vite предупреждает о deprecated CJS Node API; это прежний test tooling. Tests на failure paths используют mocks и намеренные warnings. Build/typecheck выполнены локально Windows / Node 24, а не Timeweb Node 20/Linux.

HTTP runtime был запущен только на loopback `127.0.0.1:3111`, затем остановлен. Проверены `/`, `/scan`, `/journey`, seed passport/taste, contextual login, `/admin`, admin GET/PATCH, cafe dashboard/API. GET с известным `x-middleware-subrequest` также вернул 401; независимый handler boundary проверен прямыми unit-вызовами. Никакой успешный admin read с живыми credentials, auth signup/write, SQL или mutative cron не выполнялся.

## Отдельная security-перепроверка и остаточные риски

1. Service-role admin clients создаются только после guard; PATCH body также не читается до проверки. Server page имеет отдельный guard. Middleware оставлен дополнительным boundary.
2. Публичный barista query имеет author scope и explicit published filter. Private checkin sharing default/consent и staff RLS/guards не менялись.
3. При outgoing async completion данные не возвращаются в текущий snapshot; retry выбирает только текущего owner. Partition restore фильтрует по owner. Нет глобального anonymous user id или автоматического sharing.
4. **Demo privileged path остаётся operational P0 до завершения A3.** Нужен ответ владельца о staff-переходе и ordered retirement; нельзя считать панельный gate закрытием прямого DB RPC.
5. **Next 14.2.35 не закрывает все advisories на дату работы.** Npm после обновления всё ещё сообщает новые RSC/Server Action DoS и другие issues. [Официальный Server Action DoS advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj) включает эту версию; приложение использует App Router/server actions, поэтому условия применимости присутствуют. Последний 14.2 patch и route guards не устраняют этот класс риска. Мажорный upgrade запрещён brief и не выполнен; принятие риска/изменение этого ограничения требует отдельного решения перед открытым запуском.
6. [Windows-hosted RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) применим к публичному Windows hosting affected Next. Этот тестовый сервер был loopback-only; публичный Windows hosting не подходит для такой версии. Linux Timeweb не делает применимым именно Windows filesystem condition.
7. [AVIF/sharp RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) зависит от image optimization через sharp/libheif. Sharp отсутствует в текущем lockfile и не установлен этой работой; нельзя считать этот specific path доказанно эксплуатируемым здесь, но нельзя слепо устанавливать sharp по build warning, не разобрав advisory.
8. Live deployed RLS/roles/confirm-email settings и реальные аккаунты не проверены write-сценарием. Не заявляется, что текущий живой сайт уже исправлен: deployment не было.

## QR → lot → tasting → save и mobile: что проверено

Source trace и tests покрывают: decode → passport scoped loading; non-seed catalog при возвращении; cow unknown fields → continue; restored taste draft → повторная отправка; private save payload; local write → claim/retry → own cloud rows; account-switch isolation; success scroll bounds. Сохранены taste-before-reveal и double-submit guard.

Браузерный CUA inventory сообщил `apps:[] / browsers:[]`; свежий интерактивный браузер/mobile доступен не был. Hook/RAF mocks и SSR не заменяют camera permissions, touches, CSS layout, registration, реальные Supabase RLS и восстановление на другом устройстве. Эти проверки остаются в ручной приёмке ниже, а не отмечены как выполненные.

## Операционный порядок A3 — обязательный до deployment

1. Создать личные реальные staff-аккаунты действующих XO сотрудников; вручную назначить нужные `profiles.role/cafe_id/roaster_id/barista_id`. Проверить, что каждый сотрудник входит в нужный кабинет под новой учётной записью.
2. Выключить `app_settings.pilot_demo_enabled=false` в Supabase. Этим этапом никаких SQL не выполнялось.
3. После готовности перехода завершить кодовый A3: `render.yaml` flag off, удалить hardcoded demo credential, читать только server env `PILOT_STAFF_PASSWORD`, fail-closed при отсутствии. Обновить production env и пересобрать/deploy с `NEXT_PUBLIC_PILOT_DEMO_ENABLED` false/unset. Если отдельная demo-среда сохраняется, её секрет должен быть server-only и не относиться к реальным пилотным данным.
4. Сменить пароли или удалить четыре `*@test.com`; понизить их privileged profiles до enthusiast и проверить retirement сессий по процедуре Supabase. Выключение RPC само не отменяет ранее выданные роли.

Этот порядок нельзя менять на «сначала выключить, потом выяснять, чем пользовалась кофейня». Auto-review отказал именно из-за отсутствия подтверждённого перехода.

## Остальные операционные проверки перед пилотом

- Timeweb: `npm ci` по lockfile, Node 20 согласно brief, production build/start на целевом Linux, HTTPS и reverse proxy. Node 20/Linux в этой среде не проверены.
- Supabase Site URL/Redirect allowlist — целевой домен; проверить Confirm email и signup end-to-end. Если настройка требует подтверждения, существующий flow нужно отдельно принять операционно; новая функция в этом scope не создавалась.
- Password recovery пилота — по запросу через Supabase dashboard, как согласовано Claude.
- Старый домен должен перенаправлять напечатанные `/passport/<id>` с сохранением пути. Ничего не менялось в public ids. Анонимная localStorage история на новом origin сама не переносится.
- Ручная mobile приёмка: камера телефона → QR реального не-seed XO лота → латте/cow «Не знаю» → рейтинг/заметки → barista → «Назад» (всё сохранено) → save → все кнопки модалки при ~600px/landscape → регистрация → `/journey` → другой браузер/аккаунт, история восстановлена → `/scan` тем же настоящим лотом.
- Встроенный scanner: отказ камеры/manual fallback; decode до конца sync; известный лот вне меню → retry → подходящий лот; неизвестный код → passport unknown state.
- Cloud failures: offline save, failed claim, повторный вход/sync; switch A→B→A с неподтверждённой записью; B/anonymous не видят A. Проверить реальный RLS отказ гостю/чужому staff на чужие checkins/admin data в безопасном тестовом контексте.

## Полный список фактических изменений

Изменённые tracked файлы:

1. `package.json`
2. `package-lock.json`
3. `app/(site)/journey/page.tsx`
4. `app/(site)/passport/[lotId]/taste/page.tsx`
5. `app/(site)/scan/page.tsx`
6. `app/admin/page.tsx`
7. `app/api/admin/partner-requests/route.ts`
8. `app/api/admin/partner-requests/[id]/route.ts`
9. `app/api/barista/[id]/route.ts`
10. `app/auth/actions.ts`
11. `app/layout.tsx`
12. `components/coffee/FarmerPinningModal.tsx`
13. `components/coffee/MilkBaseSelector.tsx`
14. `components/coffee/QrScanner.tsx`
15. `components/coffee/ScanLotModal.tsx`
16. `components/coffee/TastingForm.tsx`
17. `components/dev/DevRoleSwitcher.tsx`
18. `lib/auth/safeRedirect.ts`
19. `lib/journey/store.ts`
20. `lib/journey/userScope.ts`
21. `lib/types/coffee.ts`

Новые исходники:

- `lib/auth/requireAdminBasicAuth.ts`
- `app/admin/layout.tsx`

Новые тесты (старые test files не переписывались):

- `app/api/admin/partner-requests/route.test.ts` — 16
- `app/admin/layout.test.ts` — 2
- `app/api/barista/[id]/route.test.ts` — 1
- `app/auth/actions.test.ts` — 6
- `lib/auth/safeRedirect.test.ts` — 4
- `lib/types/coffee.test.ts` — 4
- `components/coffee/TastingForm.test.ts` — 2
- `components/coffee/ScannerFlow.test.ts` — 6
- `lib/journey/checkinRetry.test.ts` — 14

Новый документ: `docs/audits/CODEX_PREPILOT_IMPLEMENTATION_REPORT.md`. Ветка создана для изоляции работы; HEAD/commits не изменены. Generated ignored build artifacts не входят в source diff. Случайных изменений миграций, XO/canonical/loyalty, других продуктов или старых отчётов не обнаружено.
