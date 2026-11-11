# Разведка реализации лояльности (read-only)

- Дата съёмки: 2026-11-11
- Ветка: `fix/pre-pilot-shortlist`
- Коммит: `0d02e441cd36201cc37b7e292e4b04124249efad`
- Режим: только чтение (код, конфиги, миграции, данные не менялись, коммитов нет)

---

## 1. Карты и баллы

Терминология кода: «карта» = связка (ранговая скидка + предоплаченный абонемент) одного гостя в одной кофейне. Отдельной сущности «баллы» (начисляемые за покупку) **нет** — есть только предоплаченный рублёвый баланс абонемента и процент скидки ранга.

**Продажа карт (абонементов) из кабинета бариста:**

- Экран: кабинет бариста `/dashboard/barista` → `app/dashboard/barista/page.tsx:61` монтирует `BaristaLoyaltyPanel` (`components/loyalty/BaristaLoyaltyPanel.tsx`).
- Сценарий: скан QR гостя (`QrScanner`) или ручной ввод id → поиск гостя → кнопка «Продать абонемент» → выбор номинала → RPC `loyalty_sell_subscription`.
- Номиналы фиксированы константой `SUBSCRIPTION_NOMINALS = [1000, 1500, 3000, 5000]` (`lib/types/loyalty.ts:8`); UI — 4 кнопки (`BaristaLoyaltyPanel.tsx:249-262`). Свой номинал ввести нельзя.
- Второй сценарий той же панели — «Списать баллы» (= провести чек): сумма чека, опционально списание с абонемента → RPC `loyalty_redeem`.

**Модель данных** (миграция `supabase/migrations/0012_loyalty_module.sql`, 4 таблицы):

- `subscriptions` (0012:143-152): `id`, `guest_id` (FK auth.users, cascade), `shop_id` (plain text, не FK), `initial_nominal numeric > 0`, `current_balance numeric >= 0`, `status in ('active','exhausted','expired')`, `created_at`/`updated_at`. Поля срока действия нет.
- `guest_shop_statuses` (0012:118-134): `guest_id`, `shop_id`, `current_rank_id` (FK shop_ranks, on delete set null), `visits_count >= 0`, `total_spent >= 0`, `last_visit_at`, `rank_expires_at`, unique(guest_id, shop_id). Пишется только RPC-функцией, клиенту SELECT-only.
- `loyalty_transactions` (0012:162-173): append-only журнал, `type in ('sell_subscription','deduct_points')`, `gross_amount >= 0`, `discount_applied 0-100`, `net_amount >= 0`, `barista_id` (может стать null), `subscription_id`.
- Зеркала типов: `lib/types/loyalty.ts` (app-level) и `lib/types/database.ts:351-412` (row-типы).

**Жизненный цикл:**

1. Продажа — RPC `loyalty_sell_subscription` (0012:205-242): INSERT подписки `balance = nominal, status='active'` + запись в журнал `sell_subscription` (gross=net=nominal, скидка 0). Доступ: `profiles.role in ('barista','cafe_admin') AND cafe_id = shop_id`.
2. «Начисление» — только покупка абонемента. Баллов за покупки не начисляется; за каждый чек растут `visits_count += 1` и `total_spent += net`.
3. Списание — RPC `loyalty_redeem` (0012:244-347):
   - скидка берётся от ранга, который гость имел **до** чека (0012:285-293);
   - `net = round(gross * (100 - discount) / 100, 2)` (0012:294);
   - если выбран абонемент — с баланса списывается `net`; при `balance - net <= 0` статус → `exhausted` (0012:311-315);
   - статус гостя обновляется, ранг пересчитывается по `loyalty_rank_for` (0012:326-337), пишется журнальная запись `deduct_points`;
   - вариант «Без абонемента (оплата на кассе)» — чек проводится без движения денег (только скидка + визит).
4. Остаток — `subscriptions.current_balance`, виден гостю («Мои карты»), бариста (панель) и кофейне (реестр).

**Лимиты и поведение при нехватке:**

- `nominal <= 0` → exception «Nominal must be positive» (0012:226-228); UI продаёт только из фиксированного набора.
- `gross < 0` → exception (0012:271-273); в UI сумма > 0 обязательна.
- Подписка чужая/не та кофейня → «Subscription not found for this guest at this shop»; не `active` → «Subscription is not active» (0012:301-306).
- Нехватка баланса → exception «Insufficient subscription balance» (0012:307-309); RPC откатывается целиком (одна транзакция), бариста видит текст ошибки. Частичного списания нет — либо хватает, либо чек отклонён.
- `discount_percent` ограничен CHECK 0–15 (0012:100); UI клэмпит 0–15 (`ShopRankSettingsForm.tsx:84-87`).
- Денежной интеграции нет: оплата/фискализация — на внешней кассе Yuma, `loyalty_transactions` — только для ручной сверки (0012:6-10).

## 2. Кабинеты и хранение состояния

**Кабинеты** (карта ролей `lib/auth/cabinet.ts:5-11`):

| Роль | Путь | Возможности в лояльности |
|---|---|---|
| `enthusiast` (гость) | `/journey`, лояльность — `/loyalty` («Мои карты») | Свои карты: ранг, скидка, прогресс, остатки абонементов, свой QR, смена `display_name` |
| `barista` | `/dashboard/barista` | `BaristaLoyaltyPanel`: скан QR → продажа абонемента, проведение чека (скидка + списание), контекст гостя по своей кофейне |
| `cafe_admin` | `/dashboard/cafe` (вкладка «Лояльность» — `app/dashboard/cafe/(hub)/layout.tsx:13`, страница `app/dashboard/cafe/(hub)/loyalty/page.tsx`) | Редактор лестницы рангов (`ShopRankSettingsForm`), реестр абонементов (`ShopSubscriptionsRegistry`), аналитика/сверка с Yuma (`ShopLoyaltyAnalytics`). Может также продавать/списывать (RPC принимают обе роли) |
| `roaster_admin`, `admin` | `/dashboard/roaster`, `/dashboard/admin` | К лояльности не прикасаются |

**Хранение состояния:** полностью Supabase (Postgres), физически — 4 таблицы из п.1. localStorage-фолбэка нет и это заявлено архитектурно (`lib/types/loyalty.ts:1-6`: баланс — shared server-authoritative state; grep `localStorage` по `lib/data/loyalty.ts` пуст; анонимный per-browser id для лояльности не используется — только реальный auth.users id, 0012:12-19). Записи — только через две security-definer RPC, клиент имеет SELECT-only GRANT + RLS (0012:372-418). Файлов/кэшей нет.

## 3. Ранговая лояльность — точные значения

**Таблица `shop_ranks`** (0012:92-108): `rank_name`, `rank_order` (явный порядок лестницы), `discount_percent` 0–15, `required_visits >= 0`, `required_spend >= 0`, `retention_days` (0 = не сгорает), unique(shop_id, rank_name).

**Сид дефолтной лестницы пилотной кофейни `shop-xo-vsevolozhsk`** (0012:425-431) — конфигурируемый, не захардкожен:

| Ранг | order | Скидка | Порог визитов | Порог трат | Сгорание |
|---|---|---|---|---|---|
| Bronze | 0 | 0% | 0 | 0 ₽ | никогда (0) |
| Silver | 1 | 5% | 5 | 3 000 ₽ | 60 дней |
| Gold | 2 | 10% | 15 | 10 000 ₽ | 45 дней |
| Platinum | 3 | 15% | 30 | 25 000 ₽ | 30 дней |

**Правила начисления ранга** (`loyalty_rank_for`, 0012:192-203): берётся ранг с наибольшим `rank_order`, у которого **оба** порога одновременно выполнены (`required_visits <= visits AND required_spend <= spend`). Пересчёт — после каждого чека на обновлённых `visits_count`/`total_spent` (которые растут на `net`, т.е. после скидки).

**Скидка** — это discount от ранга, применяется при чеке по рангу до визита. Это **не кэшбэк**: баллов/процентов «на счёт» нет.

**Сгорание (retention):** при каждом чеке `rank_expires_at = now() + retention_days` (0012:332-334). Проверка — read-time (`isRankActive`, `lib/types/loyalty.ts:73-77`; колонка-комментарий 0012:126-130): просроченный ранг не переписывается, клиенты трактуют его как «нет ранга». Cron/таймеров нет. Бариста применяет скидку только если `isRankActive` (`BaristaLoyaltyPanel.tsx:66`). Гостю карточка показывает «Статус истёк» и предупреждение за 5 дней (`RETENTION_WARNING_DAYS = 5`, `LoyaltyCardView.tsx:4,71-76`). Редактируется кофейней через `ShopRankSettingsForm`.

## 4. Идентификация гостя

- **Единая сущность:** везде один и тот же `auth.users` id (= `profiles.id`, role `enthusiast`). Все таблицы лояльности ссылаются на этот uuid; отдельной анонимной идентичности у модуля нет (в отличие от checkins/recipes) — без входа «Мои карты» показывают приглашение войти (`app/(site)/loyalty/page.tsx:41-58`). Та же учётка работает в паспорте, journey и кабинете гостя.
- **QR:** гостевой QR (`components/loyalty/GuestQrModal.tsx`) кодирует строку `coffeepassport-guest:{userId}` (`lib/utils/guestQr.ts:5-9`), один и тот же во всех кофейнях. Бариста сканирует камерой или принимает «продиктованный» uuid вручную (`extractGuestId` принимает и префикс, и голый uuid, guestQr.ts:14-19). RLS-политика «staff read enthusiast display names» (0012:77-85) даёт любому бариста/cafe_admin читать `display_name`/`email` любого enthusiast до создания статуса; в комментарии зафиксирован tradeoff: «QR payload is effectively the credential», как физическая карта.
- **Телефон** в идентификации лояльности не участвует (поле `phone` есть только у кофеен/партнёрских заявок). Email — зеркало из auth.users в profiles (0012:39-44).
- Подтверждение связки: гость правит только `display_name` (column-grant, 0012:59-69), всё остальное — staff.

## 5. Видимость в ЛК и внешние интеграции

- **Гость видит:** на `/loyalty` («Мои карты», пункт меню enthusiast — `lib/auth/cabinet.ts:53`) карточку `LoyaltyCardView` на каждую кофейну: текущий ранг и % скидки, прогресс-бары «до следующего ранга» (визиты и ₽), остатки активных абонементов, предупреждение о сгорании за ≤5 дней. Баланс = `subscriptions.current_balance`; «баллов» как отдельной величины в UI нет.
- **Внешний магазин:** единственная интеграция платформы — `app/api/integrations/xo-store/lots/route.ts` (+ `lib/integrations/xoStoreAuth.ts`, `xoAdmin.ts`): P23, read-only выдача canonical lots XO Roasting для XO COFFEE Store. С лояльностью не пересекается (grep `loyal|rank|bonus|subscri|guest` по `lib/integrations` пуст). Точек связи лояльности с внешним магазином (API, вебхуки, обмен гостем/балансом) **нет**; вебхуков в проекте нет вообще. Yuma — внешняя касса сверяется вручную, API-интеграции с ней нет.

## Чего нет

- Баллов/cashback за покупки (только % скидки ранга и предоплаченные абонементы).
- Автосгорания абонементов: статус `expired` разрешён CHECK-ом, но никто его не выставляет — срока действия у подписки нет (единственное место смены статуса — 0012:313, active/exhausted).
- Cron/джоб пересчёта рангов (read-time модель).
- Интеграции оплаты, API к Yuma, фискализации.
- Свободного номинала абонемента и продажи из кабинета гостя (продажа только у бариста/кофейни).
- Телефонной идентификации, восстановления «карты» по телефону.
- Публичного API/вебхуков лояльности; server route'ов модуля нет — всё через Supabase RPC с клиента.
- Тестов: ни unit (grep по `supabase/*.test.ts`), ни e2e (в `e2e/` нет loyalty-спеки) на модуль нет; сидов в `supabase/seed` нет (только сид в миграции 0012).

## Неоднозначности

- `total_spent` растёт на `net` (после скидки) — пороги ранга фактически по сумме «реально оплаченного», формулировка «пожизненные траты» в UI может читаться иначе.
- Прогресс-бар до следующего ранга (`nextRankAbove`, `lib/data/loyalty.ts:83-90`) считает первый ранг, где не достигнут **хотя бы один** из порогов (||), тогда как выдача ранга — по И (&&): при визитах выше порога, но тратах ниже прогресс может показывать 100% по одной оси.
- Абонемент и ранг живут в разных таблицах: продажа абонемента не создаёт `guest_shop_statuses` (строка появляется только при первом чеке) — «карта» гостя в `/loyalty` собирается из объединения статусов и подписок (`fetchGuestLoyaltyCards`).
- Название операции `deduct_points` / кнопка «Списать баллы» — при списании без абонемента деньги никуда не двигаются; «баллы» здесь = сумма чека со скидкой.
- `shop_id` — plain text без FK (public.shops не существует, 0012:21-26); «жёсткая привязка к локации» — дисциплина кода, не схемы.
- `barista_id` в журнале может стать NULL при удалении пользователя; `cafe_admin` проходит те же RPC, что и бариста (роли не различаются внутри функций).
- Скидка и журнал пишутся даже для чека «без абонемента» — `loyalty_transactions.deduct_points` существует для таких чеков тоже.

## Модули / файлы / роуты (реестр)

- Миграция: `supabase/migrations/0012_loyalty_module.sql` (единственная создающая модуль; 0013 чинит RLS-рекурсию profiles, 0019/0024 только упоминают).
- Типы: `lib/types/loyalty.ts`, `lib/types/database.ts:351-412`.
- Дата-слой: `lib/data/loyalty.ts` (все функции — тонкие обёртки над Supabase; записи через RPC `loyalty_sell_subscription`/`loyalty_redeem`).
- Компоненты: `components/loyalty/BaristaLoyaltyPanel.tsx`, `GuestQrModal.tsx`, `LoyaltyCardView.tsx`, `ShopRankSettingsForm.tsx`, `ShopSubscriptionsRegistry.tsx`, `ShopLoyaltyAnalytics.tsx`.
- Роуты страниц: `app/(site)/loyalty/page.tsx` (гость), `app/dashboard/barista/page.tsx` (бариста), `app/dashboard/cafe/(hub)/loyalty/page.tsx` (кофейня).
- Утилиты: `lib/utils/guestQr.ts`; роли/кабинеты — `lib/auth/cabinet.ts`, `lib/auth/staffSession.tsx`, `lib/auth/currentUser.tsx`.
