# План переноса Coffee Passport на Timeweb Cloud

Дата аудита: 5 октября 2026 года. Репозиторий: ветка `fix/pre-pilot-shortlist`, HEAD `e5f9764`.

## Границы аудита

Проверены код, package.json/package-lock.json, next.config.js, render.yaml, env.example, SQL migrations и GitHub workflow. Доступ к действующим Render, Supabase, DNS и серверу Timeweb не использовался. Реальные production-настройки, размеры данных и нагрузка не измерены. Параметры нового сервера взяты из сообщения владельца.

Это план действий, а не выполненная миграция. Код, секреты, production-конфигурация и данные не изменялись. Коммиты, миграции, установка зависимостей и сборка не запускались. Build/typecheck/tests должны быть выполнены на этапе репетиции. Уже существовавшие незакоммиченные документы оставлены без изменений; обновлён только этот документ.

## 1. Текущая архитектура приложения

| Компонент | Результат проверки |
|---|---|
| Framework | Next.js **14.2.35**, App Router, TypeScript; SSR, Server Actions, API routes и middleware. Это Node-приложение, статического хостинга недостаточно. |
| Frontend | React/React DOM **18.3.1** по lockfile, Tailwind CSS 4, SWR, Leaflet/react-leaflet, d3-geo/react-simple-maps. |
| Backend SDK | @supabase/supabase-js **2.112.3**, @supabase/ssr **0.12.4** по lockfile. В package.json оба указаны как `latest`; воспроизводимость обеспечивать `npm ci` и сохранением lockfile. |
| Другие зависимости | QR: qrcode/jsqr; PDF: jspdf; TypeScript **5.9.3**, Vitest **2.1.9**. Прямого PostgreSQL-драйвера/ORM нет. |
| Сборка/запуск | `npm ci` → `npm run build` (`next build`) → `npm start` (`next start`). Скрипты dev/lint/test также присутствуют. |
| Render | render.yaml: Node **20.11.0**, free plan, Frankfurt, branch `main`, autoDeploy. Фактические параметры панели могут отличаться. Аудируемая локальная ветка отличается от указанной deployment branch: перед переносом сверить production commit. |
| Контейнеризация | Dockerfile и Compose в проекте не обнаружены. Next config не включает standalone output; обычный `next start` можно сохранить. |
| Public env | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_PILOT_DEMO_ENABLED должны задаваться перед сборкой. Простая замена runtime env не обновляет браузерный bundle. |

README описывает раннюю стадию и magic-link вход; фактический `app/auth/actions.ts` использует email/password signup/login. Для переноса ориентироваться на код и действующие настройки, а не на ранний README.

### Внешние сервисы

- Supabase Cloud: REST, Auth и Realtime, обращения как с сервера, так и напрямую из браузера.
- Resend: `lib/email/sendPartnerRequestNotification.ts` отправляет сведения из партнёрской заявки, включая контакты. Без RESEND_API_KEY/PARTNER_NOTIFY_EMAIL заявка сохраняется без email-уведомления.
- OpenStreetMap tiles: два компонента карты загружают зарубежные tiles напрямую из браузера.
- Nominatim: `lib/utils/geocode.ts` передаёт введённый адрес внешнему геокодеру.
- Google Maps: ссылка маршрута в CafeDetailPanel, открываемая пользователем.
- XO Admin: URL/секрет через XO_ADMIN_INTEGRATION_URL/SECRET; каталог, заказы и производство. XO Store: входящий API с XO_STORE_INTEGRATION_SECRET. Размещение этих отдельных проектов не установлено.
- ICS feeds: EVENT_SOURCE_ICS_URLS, необязательные внешние календари.
- GitHub Actions: `.github/workflows/events-cron.yml` ежедневно в 03:00 UTC вызывает POST events-archive, events-aggregate и cafe-menu-expire с EVENTS_CRON_SECRET.
- Google Fonts: `next/font/google` скачивает шрифты при сборке, затем Next раздаёт их локально. npm/GitHub/Docker registry используются для поставки кода и зависимостей.
- Произвольные URL изображений и ссылки из профилей: требуют инвентаризации. Изображения через обычный img не ограничиваются allowlist Next Image.

Платёжные SDK, Sentry/GA и отдельная очередь задач в проверенном коде не обнаружены. Это не исключает настроек вне репозитория. Перенос Next и БД сам по себе не устраняет перечисленные зарубежные зависимости.

### Переменные окружения приложения

Список подтверждён `.env.example`, `render.yaml` и обращениями `process.env` в коде. Фактические значения и включение интеграций в production неизвестны; `.env.local` не является доказательством настроек Render. Секретные значения в этот документ не включаются.

| Переменная | Назначение / обязательность | Когда задавать | Действие при переносе |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Публичный URL REST/Auth/Realtime; необходим для приложения | До build и при запуске | Заменить Cloud URL на HTTPS API Timeweb, доступный браузеру. Внутренний Docker hostname здесь не подходит. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публичный клиентский API key; доступ регулирует RLS | До build и при запуске | Задать совместимый клиентский ключ target gateway. Публичность ключа штатная; он не должен давать service-role privileges. |
| `SUPABASE_SERVICE_ROLE_KEY` | Секрет серверных admin/API/cron операций; необходим для этих функций | Серверное окружение запуска | Задать target server key с нужными правами. Не добавлять NEXT_PUBLIC_ и не передавать в браузер. |
| `ADMIN_USER` | Basic Auth legacy CRM; при отсутствии используется `admin` | Серверное окружение запуска | Явно перенести выбранный логин. |
| `ADMIN_PASSWORD` | Секрет Basic Auth; без него admin-доступ отклоняется | Серверное окружение запуска | Безопасно перенести либо согласованно ротировать. |
| `NEXT_PUBLIC_PILOT_DEMO_ENABLED` | `true` включает demo UI и server action; иначе demo отключено | До build и при запуске | Сверить реальное значение с DB app_settings. render.yaml задаёт `true`, но это не подтверждает текущее значение панели. Не менять режим пилота молча. |
| `RESEND_API_KEY` | Секрет необязательной Resend-отправки | Серверное окружение запуска | Для полного ухода от зарубежной почты заменить helper на российский SMTP; перенос ключа сохраняет зависимость от Resend. Без ключа заявка сохраняется без письма. |
| `PARTNER_NOTIFY_EMAIL` | Адрес получателя уведомлений; нужен для отправки | Серверное окружение запуска | Сверить действующий адрес; отсутствие отключает уведомление. |
| `PARTNER_NOTIFY_FROM` | Sender уведомлений; необязателен, fallback onboarding@resend.dev | Серверное окружение запуска | При переходе на SMTP использовать подтверждённый sender/domain; перенос сам по себе helper не меняет. |
| `EVENTS_CRON_SECRET` | Секрет всех трёх maintenance endpoints; без него запросы отклоняются | Next runtime и окружение timer | Настроить одинаковое значение у приложения и нового scheduler. У старого scheduler после переключения доступ отключить. |
| `EVENT_SOURCE_ICS_URLS` | Необязательный список ICS URL через запятую | Серверное окружение запуска | Сохранить только подтверждённые источники в РФ либо оставить пустым; без источников внешняя агрегация отсутствует. |
| `XO_STORE_INTEGRATION_SECRET` | Секрет входящего XO Store API; без него запросы отклоняются | Next runtime и backend Store | Согласовать значение на обеих сторонах и обновить вызываемый URL Store. |
| `XO_ADMIN_INTEGRATION_URL` | Base URL backend XO Admin | Серверное окружение запуска | Задать российский endpoint после проверки размещения Admin. |
| `XO_ADMIN_INTEGRATION_SECRET` | Секрет исходящей интеграции Admin; должен совпадать с PASSPORT_INTEGRATION_SECRET в Admin | Next runtime и backend Admin | Согласованно перенести/ротировать на обеих сторонах. Без URL или секрета функции интеграции недоступны. |

**Расхождение deployment-файлов:** `EVENTS_CRON_SECRET`, `EVENT_SOURCE_ICS_URLS` и `XO_STORE_INTEGRATION_SECRET` есть в `.env.example` и коде, но отсутствуют в `render.yaml`. Перед переносом проверить их фактическое наличие в Render отдельно; YAML не является полным перечнем production env.

### Переменные deployment и self-hosted Supabase

- `NODE_VERSION=20.11.0` в render.yaml — выбор Node на Render. В Docker версию задаёт закреплённый base image; копирование этой переменной не устанавливает Node.
- `NODE_ENV=production` и `PORT` — параметры Node/Next deployment. Next по умолчанию слушает порт 3000; согласовать порт с proxy/контейнером.
- `NEXT_TELEMETRY_DISABLED=1` — рекомендуемая настройка сборки/runtime на новой площадке; сейчас не заявлена в env.example.
- `APP_URL` и `EVENTS_CRON_SECRET` в GitHub Actions — repository secrets scheduler, а не отдельный URL приложения из его кода. При переносе расписания на systemd задать target URL и Bearer secret в защищённом окружении timer.
- Self-hosted Supabase имеет **отдельный** env-файл: пароль PostgreSQL, ключи/signing secrets выбранного release, API/public URL, SITE_URL/redirect allowlist, SMTP host/port/user/password/sender, административные credentials и секреты сервисов. Точные имена брать из env.example закреплённого официального Compose release. Это новые deployment-настройки, не уже существующие переменные Coffee Passport.
- Параметры российского SMTP для Auth задаются в Auth service. Добавление SMTP env в Next само по себе не заменяет текущий Resend helper: для уведомлений приложения потребуется отдельное изменение helper и документирование его новых env.
- Credentials backup storage нужны backup-процессу; приложению доступ к backup bucket не требуется.

Порядок переноса env: безопасно инвентаризировать настройки источника → сформировать отдельные target env → согласовать ключи gateway/Auth/Next и integration callers → собрать Next с target NEXT_PUBLIC_ → запустить с server env → проверить endpoints и отсутствие секретов в клиентском bundle. При изменении NEXT_PUBLIC_ пересобирать приложение; server env применять перезапуском. Не копировать Cloud keys в target без проверки совместимости и не хранить env/exports в git или аудиторском документе.

## 2. Архитектура Supabase и состав переноса

| Сервис | Использование и действие |
|---|---|
| PostgreSQL | Таблицы, внешние ключи, индексы, views, triggers, functions и extensions. Перенести фактическую production-схему и данные. Версия PostgreSQL Cloud неизвестна: выбрать совместимый target по результатам инвентаризации. |
| Auth | Email/password, SSR cookies, getUser, callback обмена кода на session. Перенести пользователей с прежними UUID, password hashes, identities, metadata и confirmation flags; сохранить связи с profiles. Пароли не пересоздавать. При новых URL/ключах ожидать повторный вход. |
| Storage | В runtime-коде вызовов Supabase Storage и в migrations buckets/policies не обнаружено. Существование buckets, созданных через Cloud-панель, неизвестно. Проверить отдельно. |
| Realtime | Используется postgres_changes для public.cafe_menu_entries в cafeMenuStore; migration 0032 добавляет таблицу в supabase_realtime. Сохранить публикацию и WebSocket. |
| Edge Functions | Каталог Edge Functions и вызовы functions.invoke не обнаружены. Проверить Cloud-панель на функции/hooks/webhooks, созданные отдельно. |
| RPC | В частности dev_seed_staff_profile, loyalty_sell_subscription, loyalty_redeem, events_archive_expired, events_ingest_candidate, cafe_menu_expire_discontinuing. Это PostgreSQL functions, не Edge Functions. |
| RLS | Доступ через auth.uid(), profiles и scope сотрудников. Server-only service-role обходит RLS. Перенести policies, grants, owners и SECURITY DEFINER/search_path; проверить положительные и отрицательные сценарии. |
| Migrations | 32 SQL-файла, 0001–0032. Заголовки 0004/0022 фиксируют расхождение ранней схемы с live DB. Не считать последовательное применение всех файлов способом восстановления production. |

Переносить все фактические таблицы: profiles/users и связанные Auth-записи; coffees, green_lots, lots, legacy coffee_lots, reference profiles, roast_batches; roasters/coffee_shops; checkins, recipes/equipment, replies; cafe menu; loyalty, subscriptions/ranks; events; partner requests/feedback; notification preferences/reads, app_settings и остальные объекты реальной БД.

Дополнительно перенести настройки Auth/SMTP, SQL permissions, необходимые sequence values и Storage policies. Использовать официальный порядок восстановления в существующий self-hosted Supabase, а не бесконтрольный restore всех системных схем поверх target. Системные роли/версии могут отличаться.

**Dump БД не содержит бинарные Storage objects или localStorage.** Собственный кофе, фото и некоторые профили хранятся в браузерах; часть journey синхронизируется, но возможны незавершённые записи. Сохранить данные рабочих браузеров. При сохранении того же HTTPS origin localStorage остаётся доступен; при смене домена нужен контролируемый экспорт/импорт с сохранением привязки к пользователю.

## 3. Целевая архитектура

Рекомендуется сохранить API Supabase и развернуть Next.js + self-hosted Supabase через Docker Compose на `coffee-passport-prod` в NSK-1. Это минимизирует изменения бизнес-логики.

```text
Пользователь → собственный домен HTTPS → Nginx → Next.js
Браузер/Next → api.<домен> HTTPS → Supabase gateway
                                 → Auth / PostgREST / Realtime
                                 → PostgreSQL
                                 → Storage, если нужен
Timeweb server → независимые backups в российском Timeweb storage
              → проверенный российский SMTP
На сервере: systemd timers, logs/monitoring, постоянные volumes
```

Нужны Docker Engine + Compose plugin, закреплённая версия официального Supabase stack, Next runtime, reverse proxy, SSL для обоих доменов, DNS A-записи, firewall и независимые backups. Ubuntu 26.04 присутствует в официальном списке поддерживаемых Docker ОС: переустановка только ради Docker не требуется.

Next запускать обычным next start; standalone оптимизация необязательна. Согласовать поддерживаемую версию Node с зависимостями и проверить репетиционной сборкой. Runtime Node 20.11.0 из старого render.yaml не переносить автоматически как долгосрочный стандарт.

Наружу открыть HTTPS/HTTP для сертификатов и ограниченный SSH. PostgreSQL, Studio и служебные порты не публиковать; Studio доступен через SSH/VPN. Учесть, что опубликованные Docker ports могут обходить UFW. Proxy должен поддерживать WebSocket, корректные forwarded headers и origin для Server Actions.

Обязательны шифрованные backups БД и файлов вне VDS, retention, мониторинг свободного места и проверка восстановления. Snapshot сервера полезен дополнительно. Начальная политика: ежедневный backup, RPO до 24 часов; для меньшего RPO нужны более частые копии либо WAL/PITR. Конкретный RTO определить репетицией.

**Альтернатива: только PostgreSQL на Timeweb.** Не является минимальным путём: придётся заменять Supabase REST/Auth/Realtime, прямые браузерные запросы и авторизацию. Managed PostgreSQL совместно с self-hosted Supabase возможен только после проверки ролей/extensions и увеличивает сложность подключения. Для начального переноса отдельный managed PostgreSQL не рекомендуется.

## 4. Достаточность текущего сервера

Сервер из контекста: Россия, Новосибирск NSK-1, Ubuntu 26.04, **2 CPU / 4 GB RAM / 50 GB NVMe**, публичный IPv4.

Официальный минимум полного Supabase stack: **2 CPU / 4 GB / 40 GB SSD**; рекомендация **4 CPU / 8 GB+ / 80 GB+**. Эти цифры относятся к Supabase, без гарантии запаса для Next.js и его сборки.

**Вывод:** текущий сервер подходит для подготовки и репетиции. При небольших данных и нагрузке production может работать, но достаточность сейчас не доказана. Жёсткой технической невозможности нет.

Причины малого запаса:

- RAM делят PostgreSQL, Auth, REST, Realtime, Node и ОС; next build добавляет нагрузку и риск OOM.
- 50 GB занимают ОС/образы, DB/WAL, файловые volumes, logs, временные dumps и сборки. Размеры production неизвестны.
- Два CPU делят пользовательские запросы, БД, сборку и backups; задержки нужно измерить.

**Практический рекомендуемый минимум для совместного production-развёртывания: 4 CPU / 8 GB RAM / 80 GB NVMe**, на уже выбранной российской площадке. Это инженерный запас, не измеренный порог приложения. Переходить на другой регион не требуется.

Если сохранять текущий тариф: отключить неиспользуемые сервисы по зависимостям выбранного Compose release, оставить Realtime; не включать необязательную analytics; Storage отключать только после проверки buckets. Сборку выполнять отдельно от рабочей нагрузки, ограничить logs, предусмотреть swap как страховку. До переключения проверить отсутствие OOM/restart, запас RAM и диска, задержки и backup под ожидаемой нагрузкой. Swap не заменяет RAM. Не выполнять сборку на обслуживающем production без проверенного бюджета ресурсов.

## 5. Пошаговый план

### Этап 1 — подготовка Timeweb

1. Сверить production commit, реальные Render env, Supabase версии/схему/объём, Auth settings, buckets, внешние jobs/integrations.
2. Зафиксировать production-домен, DNS, реальные QR и используемые browser origins. QR с onrender.com потребуют замены перед полным отключением Render.
3. Проверить ресурсы нового VDS, согласовать увеличение при необходимости; SSH keys, обновления ОС, firewall, временную зону и место для backups. Секреты хранить вне git.
4. Определить окно обслуживания, требования RPO/RTO, rollback и способ блокировки всех записей в Cloud. Измерить длительность на репетиции.

### Этап 2 — развёртывание окружения

1. Установить Docker/Compose; закрепить версии образов и официального Supabase release.
2. Поднять isolated target с persistent volumes, уникальными секретами и отключёнными ненужными компонентами.
3. Настроить Nginx/TLS для приложения и Supabase API, административный доступ и backup storage в РФ.
4. Подготовить Next build с target public env; сохранить server-only service-role и integration secrets на сервере. Сверить все ключи из env.example: render.yaml перечисляет не все используемые переменные.
5. Подготовить российский SMTP и systemd timer вместо GitHub cron. Не включать target scheduler до переключения.

### Этап 3 — перенос БД

1. Создать согласованные backups действующей схемы/данных/необходимых ролей по официальному Supabase restore workflow, включая Auth. Работать с защищёнными exports.
2. Восстановить пробную копию на target с учётом системных схем и версий; не запускать seed или весь исторический набор migrations поверх restore.
3. Сверить таблицы/counts, UUID/public IDs, FK, sequences, policies/grants, views/functions/triggers. Проверить обязательные extensions и Realtime publication.
4. Проверить восстановление ещё одной копии из backup; подготовить повторяемую процедуру финального переноса.

### Этап 4 — перенос Storage

1. Инвентаризировать Cloud buckets и objects. Если отсутствуют — зафиксировать отсутствие файлового переноса.
2. При наличии отдельно перенести бинарные файлы, metadata, paths, bucket settings и policies; сверить количество/размеры/checksums.
3. Заменить абсолютные старые Storage URLs и перевыпустить signed URLs. Внешние avatar URLs и localStorage-фото учесть отдельно.
4. Проверить права private/public objects и доступ через target API.

### Этап 5 — настройка Auth

1. Сохранить исходные UUID/password hashes/identities/profile links и проверить совместимость Auth schema с выбранной версией GoTrue.
2. Настроить SITE_URL, public API URL, разрешённые redirects, email confirmation и SMTP/templates по действующему поведению.
3. Согласовать ключи приложения с gateway/Auth выбранного release. Старые anon/service-role ключи не считать автоматически совместимыми.
4. Проверить старый пароль, signup, confirmation/callback, logout и повторный вход. Восстановление пароля проверить, если оно используется операционно; отдельного reset UI в проверенном коде не найдено.

### Этап 6 — тестирование

1. На target выполнить typecheck, tests и production build; проверить запуск после перезагрузки.
2. Проверить QR → passport → tasting/checkin → сохранение → повторный вход/историю; кабинеты кафе/обжарщика/бариста, меню, recipes, loyalty, notifications/Realtime.
3. Проверить RLS разных пользователей и запрещённые действия, service-role secrecy, admin auth, integration bearer secrets и три cron endpoints.
4. Проверить email, файлы, внешние integrations и browser/server network; устранить обращения в Supabase Cloud/Render после переключения.
5. Измерить нагрузку, ресурсы, backups/restore и длительность финального окна. Проверить экспорт browser-only данных при смене origin.

### Этап 7 — переключение DNS

1. Заранее уменьшить TTL и подготовить сертификаты. Это уменьшает ожидание, но не исключает старые клиенты.
2. Остановить source scheduler и integration writers. Ввести maintenance и **заблокировать все source writes**, включая прямые REST/RPC/Auth/Storage запросы браузеров. Одного отключения Render недостаточно. Конкретный механизм выбрать по доступным Cloud-возможностям и доказать тестом на репетиции.
3. После блокировки выполнить финальный согласованный export/restore и дельту файлов; сверить данные и отсутствие новых source writes.
4. Переключить DNS приложения/API; открыть запись только на target и включить только target timer.
5. Проверить login, QR, сохранение, email, Realtime и integrations с внешнего клиента. Старый endpoint не должен продолжать принимать записи.

### Этап 8 — отключение Render/Supabase после проверки

1. Наблюдать ошибки, ресурсы и delivery; проверить backup уже новых данных и его восстановление.
2. Убедиться, что QR, активные клиенты, integrations и scheduler используют Timeweb.
3. После согласованного периода проверки отключить Render/Supabase Cloud, отозвать прежние секреты и удалить зарубежные рабочие копии/exports по утверждённому сроку.
4. При QR на onrender.com полный уход требует их замены; сохранение Render как redirect остаётся зависимостью от Render.

## 6. Изменения, риски и сохранность данных

### Можно перенести без изменения бизнес-кода

Next SSR/API/Server Actions, Supabase clients, .from/RPC, PostgreSQL objects/RLS, Auth пользователей и Realtime. Необходимы инфраструктура, новые env и пересборка. DNS/TLS/backups и перенос scheduler не требуют переписывания бизнес-логики. Состояние demo accounts/app_settings сохранить; переход с demo на real accounts — отдельная задача.

### Потребует точечных изменений кода или данных

- Resend helper заменить российским SMTP, если нужны уведомления. Временное отключение Resend возможно через env, но отключит отправку уведомлений.
- Для полного российского runtime заменить OSM tiles и Nominatim на размещённые в РФ сервисы/локальные tiles либо ограничить соответствующие функции. Обычный proxy к зарубежному origin не устраняет внешнюю зависимость.
- Перенести внешние изображения и URL в данных; при строгом контуре ограничить допустимые источники. next.config.js содержит старый supabase.co hostname; актуализировать при использовании Next Image.
- XO Admin/Store должны сами обслуживаться в РФ; сменить endpoints и проверить contracts. Passport не переносит эти проекты.
- Локальные fonts нужны для сборки без Google; текущий next/font/google не создаёт Google-запросы браузера при нормальном serving.
- При строгом исключении внешних переходов заменить Google Maps ссылку; социальные ссылки оценить отдельно. GitHub как репозиторий кода отличается от зарубежного production-хранилища данных.

В этой работе перечислены будущие изменения; они не выполнены.

### Основные риски и меры

| Риск | Мера |
|---|---|
| Несовпадение migrations с production | Источник переноса — фактический schema/data export, проверенный restore. |
| Потеря Auth или связей | Сохранять UUID/hashes/identities, не создавать пользователей повторно через signup. |
| Потеря browser-only данных | Сохранить origin либо обеспечить отдельный экспорт/импорт рабочих браузеров. |
| Split brain и записи в старую БД | Один writable backend; проверенная блокировка source REST/RPC/Auth/Storage и integration writers перед final export. |
| Неполный Storage backup | Metadata и binaries переносить отдельно, проверять checksums/permissions. |
| Нарушение RLS | Сверить определения/permissions и тестировать запрещённые операции разных ролей. |
| RAM/disk exhaustion | Репетиция с нагрузкой и backup, запас ресурсов, log rotation, увеличение тарифа по результатам. |
| Отказ единственного VDS | Независимые backups в РФ и регулярно проверенный restore. Это не high availability. |
| Откат после новых записей | До открытия target writes можно вернуть source. После новых записей сначала остановить target и перенести новые DB/Auth/files обратно либо восстановить target; простой откат DNS теряет новые данные. |

Перенос без потери данных обеспечивается согласованным final export после остановки всех источников записи, отдельным учётом файлов и браузерных данных, сохранением идентификаторов, проверкой restore и единственным активным writable backend. Нулевой downtime не обещается: окно измеряется репетицией.

## 7. Следующие действия

1. Провести read-only инвентаризацию действующих Render/Supabase/DNS и VDS; получить фактические объёмы, версии, домен/QR и production commit. Секреты передавать безопасно, не включать в отчёт.
2. Решить по ресурсам: рекомендуемый старт 4 CPU / 8 GB / 80 GB в NSK-1 либо доказать пригодность 2/4/50 репетицией.
3. Подготовить отдельное окружение self-hosted Supabase + Next + proxy/TLS + российские backups/SMTP.
4. Выполнить репетиционный перенос и проверки; отдельно согласовать будущие точечные изменения для зарубежных внешних сервисов.
5. Только после успешной проверки подготовить и согласовать production-окно, final export и DNS cutover.

## Фактический прогресс подготовки Timeweb

На первом успешном host SSH-подключении подтверждены Ubuntu 26.04.1 LTS, 2 vCPU и 3908 MB RAM. Установлены Docker Engine 29.8.2 (build 7fc2dff) и Docker Compose v5.6.0; Docker запущен с автозапуском. Необходимые системные пакеты проверены через apt; обновлений на момент установки не было.

Подготовлены закрытые каталоги `/opt/coffee-passport/{app,backups,logs}`. Начата загрузка официального Supabase tag `self-hosted/v0.8.2` в `/opt/coffee-passport/supabase-source`; завершение, целостность и фактический commit пока не подтверждены. По последнему выводу владельца каталог занимает 179M, процессы git присутствуют. Пустой stack пока не подтверждён как запущенный.

Последний замер владельца до запуска Supabase: RAM total 3908 MB, used 513 MB, available 3395 MB; swap 0. Диск `/`: 48G total, 3.0G used, 45G available. Эти показатели не являются замером работающего backend и пока не позволяют присвоить ресурсную оценку A/B/C.

UFW установлен, фактический `ufw status` — inactive. Firewall, SSH и ключи не менялись. До запуска необходимо проверить, что все публикуемые порты stack привязаны к localhost. Render, Supabase Cloud, DNS и данные не затронуты; перенос данных не начат.

При продолжении host SSH получил timeout в среде агента. По инструкции владельца повторные попытки прекращены; дальнейшая подготовка выполняется блоками команд через его уже работающую root SSH-сессию. Следующий шаг — проверить процессы git, целостность полученной копии и Compose release, затем подготовить секреты и localhost-only конфигурацию.

### Последняя read-only проверка владельца после завершения загрузки

Предыдущий clone не оставил готовой копии: `/opt/coffee-passport/supabase-source` и `/opt/coffee-passport/supabase` отсутствуют; Git-процессов, Compose-файлов и контейнеров нет. Docker active, версии 29.8.2 / Compose 5.6.0. Причина завершения clone не установлена; для безопасного продолжения её расследование не требуется.

Свежий замер: RAM 3908 MB total, 490 MB used, 3417 MB available, swap 0; диск 48G total, 2.8G used, 45G available (6%). Существуют только подготовленные app/backups/logs. Следующее действие в assisted mode — закреплённый sparse checkout официального release и копирование проверенного docker-каталога в постоянный рабочий `/opt/coffee-passport/supabase`, без запуска и генерации секретов.

### Подтверждённое получение закреплённого release

Владелец подтвердил `SUPABASE_FILES_VERIFIED`: tag `self-hosted/v0.8.2`, commit `564eab8ad7840b13324f68b1bfac074ef8d51c21`, `git fsck --full` успешен. Официальные `docker-compose.yml` и `.env.example` проверены и скопированы в постоянный `/opt/coffee-passport/supabase`. Подготовка секретов и localhost-only override — следующий этап; запуск контейнеров и перенос данных ещё не выполнены.

### Подтверждённая конфигурация перед первым запуском

Владелец получил `SUPABASE_CONFIG_VERIFIED`: release v0.8.2, новые секреты с проверкой, `.env` mode 600; legacy HS256, регистрация отключена, SMTP ещё не настроен. Upstream Compose не изменён. `docker-compose.local.yml` применяется через COMPOSE_FILE и ограничивает API gateway порт 8000 и Supavisor порты 5432/6543 адресом 127.0.0.1. Другие сервисы host ports не публикуют. На момент этой проверки контейнеры не запускались; следующий шаг — первый пустой запуск и фактические health/resource measurements.

## Официальные источники

- Supabase Docker и требования: https://supabase.com/docs/guides/self-hosting/docker
- Cloud → self-hosted restore: https://supabase.com/docs/guides/self-hosting/restore-from-platform
- Отдельный перенос Storage: https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3
- Docker Engine, Ubuntu 26.04 и firewall: https://docs.docker.com/engine/install/ubuntu/

Требования Supabase и поддержка Ubuntu проверены по официальной документации во время аудита. Российское размещение SMTP/backup endpoints и внешних интеграций необходимо подтвердить у выбранных поставщиков; из репозитория это не устанавливается.

## Проверенное состояние — 9 октября 2026, самостоятельное выполнение Codex

Этот раздел заменяет прежние описания текущего состояния. Исторические записи ниже сохранены как журнал, а не как актуальная конфигурация.

### Выполнено и проверено

- Локальный и серверный Git: `fix/pre-pilot-shortlist`, HEAD `e5f9764`. Локально до работ отсутствовали изменения tracked-кода; существовали untracked-отчёты, включая этот документ. Посторонние отчёты не изменялись.
- SSH root на Timeweb работал для аудита и резервирования. Позже отдельные подключения завершились timeout; использованы ограниченные попытки с ConnectTimeout 10–15 секунд. Ключи, пароли и SSH-конфигурация не менялись.
- Все 11 имеющихся контейнеров Supabase работали; PostgreSQL image `supabase/postgres:17.6.1.136`, Auth `v2.196.0`, Storage `v1.74.0`. Для проверенных db/auth/storage/envoy: healthy, restart_count=0, restart policy unless-stopped. Повторной установки компонентов не было.
- Target API gateway слушает 127.0.0.1:8000, pooler — 127.0.0.1:5432/6543. Next.js слушает *:3000. На момент проверки listeners 80/443 отсутствовали, nginx inactive.
- Node.js `v22.23.3`; systemd `coffee-passport` active/running, WorkingDirectory `/opt/coffee-passport/app`. Локальный запрос Next HTTP вернул 200. Это не проверка пользовательских сценариев.
- `/root/coffee_passport_cloud.dump`: 486286 bytes, custom archive, создан 2026-10-09 11:54:56 UTC; source PostgreSQL 17.6, exporter pg_dump 18.6. TOC и data-only чтение успешны.
- Архив полностью восстановлен без ошибок `pg_restore --exit-on-error` в отдельную `cp_cloud_rehearsal_20261009`, созданную из template0. Рабочие `postgres` и `_supabase` не очищались и не восстанавливались.
- В восстановленном архиве: public 31 таблица / 80 строк суммарно; auth 27 таблиц / 14 пользователей, 14 непустых password hashes, 14 confirmed users, 14 identities; storage 8 таблиц / 0 buckets / 0 objects. public: 30 RLS tables, 62 политики, 14 функций, 3 пользовательских триггера, 34 FK. Единственное найденное NOT VALID constraint относится к realtime.messages.
- Read-only проверка живого Cloud API с существующим локальным серверным ключом: точные количества строк всех 31 public-таблиц совпали с архивом; ошибок/расхождений нет. Auth API: 14 пользователей. Storage API: 0 buckets. API-проверка не сравнивает полную DDL, password hashes, содержимое каждой строки, скрытые схемы или незавершённые uploads.
- В текущем рабочем target postgres: public 15 таблиц / 0 строк; auth 23 таблицы / 0 пользователей; storage 10 таблиц / 0 buckets / 0 objects. public: 15 RLS tables, 25 политик, 1 функция, 0 пользовательских триггеров. Значение 17 из information_schema включает views и не означает 17 base tables.
- Созданы закрытые backups: `/opt/coffee-passport/backups/migration-20261009T125033Z/postgres.dump` (380935 bytes), `_supabase.dump` (13252 bytes), roles.sql без паролей ролей, копии Supabase env/Compose и Next env. Каталог mode 700, файлы 600. Секреты и данные не копировались в Git.
- SHA256 postgres backup: `1218cfb2646700c52397509dafa7a895ad27bba7426d8718df22467fa0e82809`; _supabase backup: `39f76e066f8c93a813dc642f0a70d4070452f6eab00b8d02af282cfa519e6251`.
- Обе копии читаются `pg_restore --data-only --file=/dev/null`. postgres backup успешно восстановлен в отдельную `cp_restore_verify_20261009125034`; количества строк всех public/auth/storage таблиц совпали с текущей target-базой. Полное восстановление `_supabase` отдельно пока не проверялось.
- Закрытые журналы и агрегированная инвентаризация сохранены в том же backup-каталоге: target-restore.log, cloud-rehearsal.log, inventory-summary.json, source-api-audit.json. Пользовательские строки/секреты в репозиторий не включены.

### Найденные несовместимости и незавершённые проверки

- Target public содержит другую, частично применённую схему; восстановление поверх неё недопустимо. Нужна согласованная замена public после проверки свежего source export и отката.
- Cloud Auth содержит дополнительные mfa_recovery_code_sets, mfa_recovery_codes, scim_tokens, scim_users и one_time_tokens.expires_at. У target отсутствуют эти таблицы/колонка. Успешный SQL restore в отдельную базу не доказывает совместимость с работающим GoTrue. Служебные Auth/Storage migration history нельзя заменять вслепую.
- Target Next NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:8000`: браузер внешнего пользователя не сможет использовать этот адрес. Нужны HTTPS API URL и пересборка.
- Target Supabase public URL / Auth SITE_URL используют localhost; SMTP_HOST=`supabase-mail`, работа SMTP не подтверждена. Внешние OAuth flags в проверенном контейнере не обнаружены. Авторизация реальными пользователями не проверялась.
- Auth health через gateway без API key возвращает 401; это не свидетельство неисправности Auth.
- Next журнал за 24 часа содержит 10 строк с error и 10 с failed; причины ещё не установлены. Нельзя считать приложение проверенным по HTTP 200.
- Source PostgreSQL: существующий локальный сохранённый пароль отклонён (authentication failed). Значение не выводилось. Запрошено обновление только существующего ignored-файла локально; секрет в чате не запрашивался. API-доступ удалось использовать независимо от SQL-пароля.
- Живая DDL, роли/grants/owners, содержимое строк и актуальная migration history источника не сверены. Исходный exit code pg_dump неизвестен. Полнота архива по сравнению со всем source ещё не доказана.
- Фактическая передача Storage binaries не выполнялась: живой API сообщает ноль buckets. Требуется SQL-сверка storage metadata и незавершённых uploads, прежде чем закрыть этап.
- HTTPS/домен, сценарии login/signup/callback, фактические проверки RLS запретов, Realtime, интеграции, cron, restart/reboot и восстановление новых production-данных не проверены.
- Backups находятся на том же сервере; независимого backup-хранилища пока нет.

### Границы изменений и откат

Рабочие postgres/_supabase и исходные Render/Supabase не изменялись. Созданы только резервные копии и две изолированные базы проверки; они не подключены к сервисам. DNS/production traffic не переключались. Авторизация на разрушительное изменение не запрашивалась: сначала требуется сверка живого source PostgreSQL.

Перед изменением рабочей базы: подтвердить source schema/data, подготовить отфильтрованный transactional restore с сохранением target служебных схем, отрепетировать Auth/Storage совместимость и представить точный scope на согласование. Доказанная возможность SQL-restore текущего postgres уже есть; это ещё не полный service rollback. При rollback после появления новых target-записей нужна обратная синхронизация, а не простой DNS rollback.

Готовность к production-переключению: **НЕТ**. Блокер SQL-сверки — актуальная source credential; финальный destructive restore и DNS требуют отдельного подтверждения владельца.

Методика сверена с официальными инструкциями: https://supabase.com/docs/guides/self-hosting/restore-from-platform и https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3 . База, Auth-конфигурация и Storage binaries проверяются отдельно.

## Продолжение — 9 октября 2026, SQL-доступ восстановлен

- Актуальный локальный пароль принят PostgreSQL источника; использован только через stdin и environment дочерних процессов. Значение не выводилось и не включалось в Git.
- Создан свежий полный экспорт `/opt/coffee-passport/backups/source-audit-20261009T132002Z/cloud.dump`: 581177 bytes, pg_dump exit 0, SHA256 `0140fc879c10b34b62d334ad22f26697d902602c73a60ce06e9f2bf4ddb19ba0`. Чтение TOC/data успешное; полное восстановление в `cp_source_20261009_132002` завершилось exit 0.
- Считаны живые каталоги источника: 66 public/auth/storage таблиц, 708 колонок, 254 ограничения, 62 политики, 37 функций, 11 пользовательских триггеров; роли, memberships, ACL, default ACL, зависимости, extensions и миграционная история Auth/Storage сохранены в закрытых JSON на сервере. SQL definitions и пользовательские данные не включаются в Git.
- Содержимое всех 66 таблиц живого источника сверено с восстановленной свежей выгрузкой через упорядоченные digests канонических JSON-строк и точные row counts. Расхождений нет. Проверка каждой стороны выполнялась в repeatable-read/read-only транзакции. Это подтверждает совпадение на момент проверки, но не останавливает последующие записи в Cloud.
- Источник Auth имеет 82 служебные миграции, target — 77; Storage: 73 и 70 соответственно. Дополнительные source Auth таблицы и отсутствующая на target колонка относятся к пустым таблицам. Все Storage таблицы источника, кроме migration history, пусты, включая multipart uploads. Передавать binaries из этих buckets не требуется: buckets отсутствуют и по SQL, и по API.
- Подготовлен выборочный импорт: source public schema/data, шесть непустых совместимых auth tables (users, identities, sessions, refresh_tokens, flow_state, mfa_amr_claims), Auth sequence values и прикладной trigger `on_auth_user_created_profile`. Target Auth/Storage schemas и их migration history сохраняются. Пустые source-only Auth таблицы не создаются вручную; данные остаются также в полном архиве.
- Выявлено и исправлено исключение pg_restore: schema ACL entries имеют TOC namespace `-` и пропускаются `--schema=public`. Импорт теперь отдельно восстанавливает точные source public schema ACL и владельца, не выдумывая grants.
- Свежий target backup перед репетицией сохранён в `candidate-20261009_134404/target-before.dump` внутри source-audit каталога; `_supabase` также зарезервирован. Копия postgres полностью восстановлена в отдельную candidate DB и проверена сравнением row counts/digests всех её public/auth/storage таблиц.
- Выборочный импорт в `cp_candidate_20261009_134404` выполнен одной транзакцией и прошёл сравнение содержимого всех 31 public таблиц и шести импортируемых Auth таблиц. Histories target Auth/Storage не изменились.
- Установленные образы Auth и PostgREST проверены временными localhost-only контейнерами на candidate DB. Все 21 проверки успешны: health, password login/getUser/refresh/своя profile role для четырёх пилотных аккаунтов, отклонение неверного пароля, запрет анонимного повышения роли, защита partner requests и публичное чтение shops. Containers остановлены и удалены после проверки; рабочие сервисы не переключались.
- Для private partner requests корректен HTTP 200 с пустым массивом при RLS и отсутствии SELECT policies для anon; первоначальное требование именно HTTP 401/403 было исправлено. Проверка также подтверждает RLS enabled и отсутствие разрешающей anon SELECT policy.
- Проверенные инструменты добавлены в `scripts/timeweb/`: read-only SQL audit/export, проверка export против живого источника, подготовка изолированного candidate и API-проверки. Все private exports/logs/env остаются на сервере вне репозитория.
- Запрошено отдельное согласование транзакционного импорта в рабочий `postgres`. На момент этой записи он не выполнен. `_supabase`, Cloud, Render и DNS не изменены.
- Для HTTPS запрошены имена доменов; вариант проверки по IP без DNS сверён с официальной документацией Let’s Encrypt. Ubuntu certbot 4.0 не поддерживает IP certs; нужен certbot >=5.4. HTTPS в этой записи ещё не объявляется готовым.

## Проверенный HTTPS endpoint без DNS-переключения

- Nginx установлен (ранее отсутствовал); подготовлен reverse proxy для Next и API path `/supabase/`. Публичный proxy допускает только Auth/REST/Storage/Realtime/Functions/GraphQL; Studio и внутренние administrative routes возвращают 404.
- Выдан доверенный IP certificate Let’s Encrypt для `147.45.102.186` через pinned `certbot/certbot:v5.4.0`. Ubuntu certbot 4.0 не устанавливался. Nginx config проверен `nginx -t`.
- Endpoint `https://147.45.102.186/` проверен доверенным curl с сервера и внешним Windows curl: HTTP 200, без отключения certificate validation. PowerShell Invoke-WebRequest ранее дал connection error; внешний curl подтвердил рабочий TLS.
- Timer `coffee-passport-cert-renew.timer` включён: проверка продления каждые шесть часов, reload Nginx после renew. `certbot renew --dry-run` успешно завершён. Короткий IP certificate требует работающего продления.
- DNS/production traffic не переключались. HTTP 200 ещё не подтверждает полноценное приложение: импорт рабочей базы ожидает отдельного согласования, а Next public URL всё ещё требует пересборки с HTTPS API.
- Конфигурация proxy, service/timer и проверенный installer включены в `deploy/timeweb/` и `scripts/timeweb/configure_ip_https.py`. ACME account/private key и issuance/renewal logs остаются только на сервере.

## Код конфигурации Next.js

- `next.config.js` теперь берёт image hostname/protocol/port из фактического `NEXT_PUBLIC_SUPABASE_URL`, сохраняя прежний Cloud hostname как fallback при отсутствии env. Разрешение всех произвольных hosts не добавлялось.
- `.env.example` поясняет публичный HTTPS URL и обязательную пересборку NEXT_PUBLIC variables.
- Локальный `npm run build` с этими изменениями завершился успешно: compilation, встроенные lint/type checks и генерация всех 38 static pages. Runtime Timeweb env и server rebuild проверяются отдельно; локальная сборка сама по себе их не подтверждает.
- Read-only Source Auth settings API подтвердил: signup разрешён, email/password включён, email autoconfirm=true, phone и все OAuth providers отключены. У target обнаружены email autoconfirm=false и phone=true; для сохранения source-сценариев эти target flags требуют исправления вместе с SITE_URL/callback URL.

## Runtime Timeweb — выполнено и проверено, рабочий импорт всё ещё ожидает согласования

- Серверный checkout обновлён fast-forward до `f406fd9`. Next.js успешно пересобран на Timeweb с `NEXT_PUBLIC_SUPABASE_URL=https://147.45.102.186/supabase`; процесс остановлен только на время сборки и затем запущен. Серверные env и предыдущая `.next` сохранены в закрытом `/opt/coffee-passport/backups/runtime-20261009_141720/`.
- Target anon/service-role keys взяты из действующей backend env, Cloud API keys не подставлялись. Дополнительные app env строки перенесены из существующего локального `.env.local` по whitelist; это не подтверждает равенство всем production Render env. Секреты не выводились. Полный Compose config с секретами использован только в памяти, stdout не сохранён в лог.
- Client bundle проверен: прежние `127.0.0.1:8000` / Cloud API URL и target service-role key / JWT secret не найдены. Это конкретная проверка используемых ключей, а не универсальный сканер всех возможных секретов.
- Auth контейнер пересоздан с source flags: signup разрешён, email/password включён, email autoconfirm=true, phone/anonymous/OAuth отключены. Public API /auth/v1/settings и /health через HTTPS подтвердили ожидаемые флаги и HTTP 200. SITE_URL и callback/API_EXTERNAL_URL используют HTTPS IP endpoint. SMTP mail transport не настроен; текущие source signup/password flows не требуют email confirmation. Доставка писем не проверялась.
- Использованы фактические Compose files из container labels: docker-compose.yml и docker-compose.local.yml. Перед перезапуском проверено, что backend published ports остаются localhost-only. Остальные сервисы не переустанавливались; все 11 контейнеров после изменения Auth healthy.
- Next systemd drop-in ограничивает listener `127.0.0.1:3000`; прямой публичный HTTP-порт Next закрыт. HTTPS, /auth/login, API health/settings/REST проверены после перезапуска. Nginx остаётся публичным входом 80/443; Studio/internal proxy routes проверены на HTTP 404.
- Выполнены 16 runtime-проверок, все успешны: HTTPS после рестарта Next, localhost bind, source Auth flags, API health, Studio protection и Storage lifecycle. Создан только уникальный disposable probe bucket; проверены private/public upload/download и SHA256 содержимого, запрет public read приватного объекта и signed URL download. Тестовые object/bucket удалены, исходный bucket inventory восстановлен. Existing buckets/files/users/source services не изменялись.
- Проверка текущего рабочего postgres подтвердила 0 Auth users и 15 public tables: source data import не выполнялся. Пользовательские кабинеты на рабочем target ещё не могут пройти полную приёмку. Предыдущие 21 Auth/REST проверки относятся к изолированному candidate, а не к рабочей базе.
- Полная копия `_supabase` дополнительно успешно восстановлена в отдельную `cp_internal_verify_20261009_143156`; содержимое всех пяти её user tables совпало с живой `_supabase`. Рабочая служебная база не изменялась. Вместе с ранее проверенным восстановлением postgres это подтверждает SQL restore обеих баз; полного system reboot/failover ещё не было.
- Скрипты secure runtime configuration и runtime/Storage verification сохранены в `scripts/timeweb/`. Python syntax checks успешны; сборка и runtime checks выполнены фактически. Prepared rollback paths не запускались на рабочей базе, потому что destructive import ещё не согласован.
- Повторные default SSH подключения давали TCP timeout до authentication. Вне ограниченного сетевого окружения подключения с `IPQoS=none` позволили завершить настройку; первопричина TCP failures не доказана. Пароли/ключи/SSH server config не менялись. Browser inventory пуст — Timeweb browser console не использовалась.
- Cloud/Render/DNS не переключались. Source остаётся writable; перед production cutover нужен свежий согласованный snapshot/sync. Смена browser origin и неизвестные production Render integration env остаются отдельными ограничениями приёмки.
- Техническая готовность всего приложения: **НЕТ**. Следующая операция — уже отрепетированный транзакционный source import в рабочий postgres; требуется явное согласование удаления существующей пустой public schema. Разрешение пока не получено.

## Согласованный рабочий импорт и откат — 9 октября 2026

- Получено явное разрешение владельца на уже отрепетированный импорт 31 таблицы / 14 пользователей, с обязательным откатом при провале приёмки.
- До изменения повторно проверены hashes утверждённого SQL и baseline dump, читаемость postgres/_supabase backups и отсутствие новых данных. Состояние всех public/auth/storage таблиц совпало с baseline; пользовательских строк не было.
- Свежие backups и rollback SQL сохранены в `/opt/coffee-passport/backups/source-audit-20261009T132002Z/working-20261009_151559/`. Полная копия baseline восстановлена в отдельную базу; импорт и откат отрепетированы, содержимое после отката совпало с baseline.
- В рабочий postgres применён неизменённый filtered SQL SHA256 `7d54b601c1c5e718a06e68b1c93f206a3d5a8bc93c2bba3db751eeeb6079face`, одной транзакцией. Сразу после импорта все 31 public / 6 Auth таблиц совпали со снимком по counts/digests; 14 пользователей импортированы. Служебные схемы, histories Auth/Storage и `_supabase` сохранены.
- HTTPS integration acceptance выполнила 54 проверки, включая cleanup: четыре роли login/getUser/refresh/profile/свой кабинет; запрет чужого кабинета; неверный пароль; анонимные private/API/admin запреты; публичные каталоги и страницы; passport endpoint; signup autoconfirm и profile trigger; своя приватная дегустация write/read и запрет подделки владельца. Все успешны, probe user/checkin удалены. Это HTTP/SDK проверки, визуальная browser-приёмка не выполнялась.
- Итоговая SQL-сверка обнаружила **реальное расхождение public schema ACL**: source содержит PUBLIC USAGE (`=U/pg_database_owner`), target после filtered restore не содержит этого grant. Остальные object ACL и grants совпали. Ошибочные первоначальные различия table_catalog и search_path-qualified definitions отдельно диагностированы; они не являются изменением данных/политик.
- Причина: pg_restore ACL исходит из стандартного default public schema grant, тогда как `CREATE SCHEMA public AUTHORIZATION postgres` создаёт схему без PUBLIC USAGE. Проверенная ранее полнота данных и API smoke tests этого не обнаруживали. Процедура требует отдельного исправления и повторной репетиции; рабочий импорт автоматически повторять запрещено.
- По условию владельца приёмка остановлена и выполнен подготовленный транзакционный откат public + импортированных Auth данных. Дополнительно очищены Auth session/audit записи, созданные при приёмке: до импорта все эти Auth business tables были подтверждённо пусты. Служебная migration history сохранена.
- **Откат выполнен и проверен**: counts/digests всех baseline public/auth/storage таблиц совпали; все таблицы `_supabase` совпали. Next/Auth/REST снова запущены. Рабочая база вернулась к 15 пустым public tables / 0 Auth users. Исходный экспорт и пользовательские данные сохранены в закрытых backups.
- Source Cloud, Render и DNS не изменялись. HTTPS адрес остаётся `https://147.45.102.186`; наличие страницы по этому адресу не означает завершённую миграцию.
- Оставшееся: исправить и отрепетировать восстановление public schema ACL, согласовать повторный рабочий импорт, затем завершить приёмку после рестарта, browser сценарии и проверку production integrations. Перед переключением также нужен свежий sync writable Cloud и решение о домене/browser origin; SMTP delivery и независимое backup-хранилище не проверены.
- Готовность к production-переключению: **НЕТ**. Рабочий импорт откачен из-за провала итоговой проверки прав, согласно прямому условию владельца.

## Исправление ACL и успешный рабочий импорт — 9 октября 2026

- Владелец явно разрешил исправление прав и повторный импорт 31 public таблицы / 14 пользователей с сохранением служебных схем, без отключения Cloud/Render и без DNS-переключения.
- Исправлена процедура `prepare_candidate.py`: полный public schema ACL восстанавливается из фактического `aclexplode` источника, включая grantor, grantee, privilege и grant option. Владельцы и прочие ACL архива сохраняются; стандартный PUBLIC USAGE больше не предполагается существующим после CREATE SCHEMA.
- Новый исправленный candidate `cp_candidate_20261009_153633` прошёл сравнение данных всех 31 public / шести Auth таблиц и точную проверку schema ACL. Служебные Auth/Storage migration histories сохранены.
- Полная SQL ACL-проверка candidate прошла по 12 категориям: tables, columns, constraints, policies, RLS, functions с owners/proacl, triggers, table grants, schema ACL, object ACL (включая sequences/views), default ACL и необходимые роли. Для SQL definitions использован одинаковый search_path; сравнение ACL не зависит от порядка записей массива, а table_catalog намеренно исключён как имя проверочной базы.
- Все 21 Auth/API проверки candidate успешны. Перед рабочим импортом снова подтверждены отсутствие новых пользовательских данных, hashes SQL/backups, читаемость архивов; созданы свежие backups и повторно отрепетирован импорт/откат.
- Первая попытка приёмки исправленного рабочего импорта прошла ACL/data/Auth/API, но тест health после рестарта ошибочно не передал обязательный gateway apikey. HTTP 401 вызвал автоматический откат, который проверен. Это ошибка проверочного инструмента, а не установленная неисправность Auth. Проверка исправлена и отдельно подтверждена runtime/Storage тестами; затем тот же разрешённый SQL повторно применён после нового проверенного отката и baseline guard.
- **Текущее рабочее состояние:** импорт в `postgres` завершён, 31 public таблица и 14 Auth users. Закрытый отчёт/rollback/preimport backups: `/opt/coffee-passport/backups/source-audit-20261009T132002Z/working-20261009_154903/`. Все public данные совпали со снимком; исходные user UUID/password hashes/email confirmations сохранены. Auth sessions изменяются при тестовых входах; сохранение старых Cloud JWT-сессий не заявляется.
- Все 12 SQL ACL категорий рабочей базы прошли; отдельная итоговая сверка 11 SQL каталогов, public row counts/digests после очистки probe-записей, user IDs/hashes/confirmation, service histories и `_supabase` прошла без расхождений.
- Все 54 HTTPS/SDK проверки Auth/API/кабинетов прошли до рестарта и повторно после рестарта: четыре роли login/getUser/refresh/profile/dashboard; запреты чужого/анонимного доступа; публичные каталоги и страницы; паспорт; signup/profile trigger; private tasting write/read и RLS. Созданные probe users/checkins удалены. Отчёты `working-api-verification.json` и `working-api-after-restart.json` содержат только результаты, без токенов/данных.
- 16 runtime/Storage проверок также успешны: HTTPS, localhost Next bind, Auth flags/health через apikey, закрытый Studio, private/public binary upload/download digest, signed download, cleanup и сохранённый bucket inventory. Source Storage пуст, перенос существующих файлов не требовался.
- Next/Auth/REST перезапущены; HTTPS и Auth после рестарта успешны. Все 11 Supabase containers healthy; Next, Nginx и cert renewal timer active. Protected runtime logs проверены на panic/uncaught exception/unhandled rejection/segfault; этих признаков не найдено. Это не утверждение об отсутствии любых предупреждений или о reboot всего сервера.
- Принятое состояние зарезервировано и полностью восстановлено в `cp_accepted_20261009_155118`. Архив `/opt/coffee-passport/backups/source-audit-20261009T132002Z/accepted-20261009_155118/postgres.dump` прочитан pg_restore и восстановлен без ошибок; public contents и user IDs/hashes/confirmations совпали с рабочей базой. Все 14 пользователей на месте. Рабочая `_supabase` сохранена; её проверенные backups остаются доступными.
- **Рабочая база прошла выполненные технические проверки. Готовность к финальной пользовательской приёмке: ДА**, адрес `https://147.45.102.186`.
- Визуальная browser-приёмка не выполнена (доступные browser surfaces отсутствуют); SMTP delivery и все реальные Render production integration env не подтверждены. Cloud остаётся writable, поэтому перед production cutover нужен финальный согласованный sync и решение о production domain/browser origin. Независимое backup-хранилище не настроено. Переключение production traffic пока не разрешено и не выполнено.
- Source Cloud, Render и DNS не изменены. Новые production-записи на target требуют отдельной стратегии reconciliation перед откатом; empty-baseline rollback нельзя применять после начала production-записи.
