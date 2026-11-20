-- =========================================================
-- Афиша мероприятий: исправление двух неверных сидовых строк + кураторская
-- лента, гарантирующая ≥4 ближайших события (пакет №4)
--
-- Разбор «почему на витрине только 2 события»: сид 0014 внёс 4 строки, две
-- из них (PIR Coffee / PIR Expo, 26–29 октября 2026) корректно архивировались
-- ежедневным кроном; агрегатор новых кандидатов не получает, потому что
-- внешние ICS-источники не настроены (EVENT_SOURCE_ICS_URLS пуст). Оставшиеся
-- две строки оказались фактически неверными (проверка официальных страниц,
-- ноябрь 2026):
--
--   1. «Coffee Fest», Севкабель Порт, 21–22 ноября 2026 — зимний Open Coffee
--      Fest реально пройдёт 5–6 декабря 2026 в Брусницын Холле (летний фест
--      этого бренда был в июне в Севкабеле). Ссылка отсутствовала.
--   2. «World of Coffee», Милан, 19–21 февраля 2027 — такого события нет:
--      европейский WoC 2026 прошёл в Брюсселе в июне, ближайшие реальные
--      остановки серии — Дубай (26–28 января 2027), Новый Орлеан (9–11
--      апреля 2027), Токио (28 апреля — 1 мая 2027). Ссылка вела на
--      общий корень сайта серии.
--
-- Оба ряда исправляются В ЗНАЧЕНИЯ кураторской ленты (lib/events/
-- curatedEvents.ts) — тогда ежедневный top-up крона (ensureCuratedEvents,
-- app/api/cron/events-aggregate) видит те же ключи (title, start_date) и не
-- дублирует строки. Остальные шесть событий ленты вставляются с тем же
-- идемпотентным ключом.
--
-- Идемпотентность и конфликт-безопасность (Codex review, пакет №4 round 1,
-- finding 4): каждый UPDATE двухветочный — (a) целевой ключ (title,
-- start_date) ещё НЕ занят → старый сидовый ряд перезаписываем в значения
-- ленты; (b) ключ УЖЕ занят (ежедневный top-up успел вставить каталожную
-- строку до того, как владелец накатил миграцию) → старый ряд архивируем,
-- дубликат не создаём, миграция не падает на unique (title, start_date).
-- Повторный прогон: (a) не находит старых значений, (b) — no-op по статусу.
--
-- Проверка после наката:
--   select title, start_date, end_date, link, status from public.events
--     where status = 'active' and end_date >= current_date
--     order by start_date;  -- ≥4 строк, у каждой непустой https-link
-- =========================================================

-- 1a. Coffee Fest → Open Coffee Fest (зимний, Брусницын Холл, 5–6 декабря 2026)
update public.events
set title = 'Open Coffee Fest',
    location = 'Санкт-Петербург, Брусницын Холл',
    description = 'Зимний открытый кофейный фестиваль: маркет обжарщиков и кофейных проектов со всей России, лекторий лидеров индустрии, чемпионат каптестеров. Вход свободный.',
    start_date = '2026-12-05',
    end_date = '2026-12-06',
    link = 'https://opencoffeefest.ru',
    updated_at = now()
where title = 'Coffee Fest'
  and start_date = '2026-11-21'
  and end_date = '2026-11-22'
  and not exists (
    select 1 from public.events
    where title = 'Open Coffee Fest' and start_date = '2026-12-05'
  );

-- 1b. Тот же переход при уже занятом ключе: дубль не плодим, старый ряд архивируем.
update public.events
set status = 'archived',
    updated_at = now()
where title = 'Coffee Fest'
  and start_date = '2026-11-21'
  and status <> 'archived'
  and exists (
    select 1 from public.events
    where title = 'Open Coffee Fest' and start_date = '2026-12-05'
  );

-- 2a. World of Coffee (несуществующий «Милан») → World of Coffee Дубай
update public.events
set title = 'World of Coffee Дубай',
    location = 'Дубай, Dubai World Trade Centre',
    description = 'World of Coffee Middle East — профессиональная выставка спешелти-кофе: обжарщики, оборудование, чемпионаты World Coffee Championships.',
    start_date = '2027-01-26',
    end_date = '2027-01-28',
    link = 'https://dubai.worldofcoffee.org',
    updated_at = now()
where title = 'World of Coffee'
  and start_date = '2027-02-19'
  and end_date = '2027-02-21'
  and not exists (
    select 1 from public.events
    where title = 'World of Coffee Дубай' and start_date = '2027-01-26'
  );

-- 2b. Ключ занят — старый ряд архивируем без дубля.
update public.events
set status = 'archived',
    updated_at = now()
where title = 'World of Coffee'
  and start_date = '2027-02-19'
  and status <> 'archived'
  and exists (
    select 1 from public.events
    where title = 'World of Coffee Дубай' and start_date = '2027-01-26'
  );

-- 3. Остальные события кураторской ленты (lib/events/curatedEvents.ts —
--    источник истины для top-up; сюда копируются дословно, drift ловит
--    supabase/curatedEventsSeed.test.ts).
insert into public.events (title, location, description, start_date, end_date, link, status, source)
values
  (
    'Фестиваль «ОГОНЁК»', 'Санкт-Петербург, Севкабель Порт',
    'Фестиваль кофе, чая и подарков: ярмарка независимых кофейных и гастро-проектов, главная сцена, дегустации. Открывает сезон Russian Coffee Cup 2027. Вход бесплатный.',
    '2026-12-13', '2026-12-14', 'https://vk.ru/ogonek_fest', 'active', 'curated'
  ),
  (
    'African Fine Coffees Conference', 'Кампала, Уганда',
    'African Fine Coffees Conference & Exhibition — крупнейшая африканская конференция по кофе: торговля, каппинги, чемпионаты бариста и латте-арт Африки.',
    '2027-02-14', '2027-02-19', 'https://afca.coffee', 'active', 'curated'
  ),
  (
    'India International Coffee Festival', 'Бангалор, Индия',
    'Международный фестиваль кофе Индии: выставка спешелти-кофе, национальные чемпионаты бариста и каптестеров, каппинги моносортов.',
    '2027-02-26', '2027-02-28', 'https://www.indiacoffeefestival.com', 'active', 'curated'
  ),
  (
    'World of Coffee Новый Орлеан', 'Новый Орлеан, США',
    'World of Coffee USA — флагманская выставка Specialty Coffee Association в США: чемпионаты, лектории, оборудование и обжарка.',
    '2027-04-09', '2027-04-11', 'https://usa.worldofcoffee.org', 'active', 'curated'
  ),
  (
    'CAFEX', 'Москва, Тимирязев Центр',
    'CAFEX (ex Coffee Tea Cacao Russian Expo) — профессиональная выставка кофе, чая и какао; в программе финал национального конкурса «Бариста Года».',
    '2027-04-14', '2027-04-16', 'https://coffeeteacacaoexpo.ru', 'active', 'curated'
  ),
  (
    'World of Coffee Токио', 'Токио, Tokyo Big Sight',
    'World of Coffee Asia и чемпионат мира среди бариста (World Barista Championship): выставка спешелти-кофе и мировые финалы под одной крышей.',
    '2027-04-28', '2027-05-01', 'https://asia.worldofcoffee.org', 'active', 'curated'
  )
on conflict (title, start_date) do nothing;
