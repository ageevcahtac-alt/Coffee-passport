// Кураторская лента «всегда ≥4 событий» (пакет №4). Реальные ближайшие
// кофейные мероприятия (Россия + мир), сверенные вручную по официальным
// страницам на ноябрь 2026. Ежедневный агрегатор (app/api/cron/
// events-aggregate) добирает эту ленту до минимума, если внешние ICS-источники
// (EVENT_SOURCE_ICS_URLS) и ручные публикации набрали меньше — гарантия
// «на витрине ВСЕГДА ≥4 ближайших события» держится на уровне данных, а не
// UI. Дедуп — уникальный ключ таблицы (title, start_date): сид-миграция
// 0049 фиксит два заведомо неверных сидовых ряда В ЭТИ ЖЕ значения, поэтому
// повторный прогон top-up их не дублирует.
//
// Правила добавления: только официальные страницы (сайт события или
// официальная страница анонса — VK допустим как источник, если сайта нет),
// даты в ISO YYYY-MM-DD, прошедшие события УБИРАТЬ (events-archive сам
// архивирует, но каталог должен оставаться про запас будущих прогонов).
// supabase/curatedEventsSeed.test.ts пинит соответствие каталога сиду 0049.

export interface CuratedEvent {
  title: string;
  location: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  link: string; // официальная страница; пустой не бывает — только живые https
}

import type { SupabaseClient } from '@supabase/supabase-js';

export const MIN_ACTIVE_EVENTS = 4;

export interface TopUpResult {
  activeCount: number;
  inserted: number;
  promoted: number;
  errors: string[];
}

// Гарантия «на витрине ВСЕГДА ≥ MIN_ACTIVE_EVENTS ближайших событий»:
// если активных незавершившихся строк меньше минимума, добираем самыми
// ближайшими из кураторской ленты (статус active — это доверенный
// ручной кураторский источник, модерация не нужна; внешние ICS-кандидаты
// по-прежнему проходят pending_review). Идемпотентна: повторный прогон на
// той же базе ничего не вставляет.
//
// Обработка существующих строк с ключом (title, start_date) каталога
// (Codex review, пакет №4 round 1):
// - pending_review — это то же событие из другого источника: ПОВЫШАЕМ до
//   active (каталог доверенный), дубль не вставляем;
// - archived — осознанное решение админа/крона: НЕ воскрешаем, пропускаем;
// - active — уже на витрине: учтено в счётчике, пропускаем.
// Ошибки вставки/повышения НЕ проглатываем: возвращаем в errors, роут
// пишет их в ответ и лог — иначе крон молча завершился бы с <4 событиями.
export async function ensureCuratedEvents(supabase: SupabaseClient): Promise<TopUpResult> {
  const today = new Date().toISOString().slice(0, 10);

  const { count: activeCountBefore, error: countError } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('end_date', today);
  if (countError) {
    throw new Error(`ensureCuratedEvents: не удалось посчитать активные события: ${countError.message}`);
  }
  let activeCount = activeCountBefore ?? 0;
  const result: TopUpResult = { activeCount, inserted: 0, promoted: 0, errors: [] };
  if (activeCount >= MIN_ACTIVE_EVENTS) return result;

  const { data: existing, error: readError } = await supabase
    .from('events')
    .select('id, title, start_date, status');
  if (readError) {
    throw new Error(`ensureCuratedEvents: не удалось прочитать события: ${readError.message}`);
  }
  const takenKeys = new Set((existing ?? []).map((row) => `${row.title}|${row.start_date}`));
  // Блокируют вставку новой строки; pending_review отдельно — не блокирует,
  // а повышается до active (это то же событие из другого источника).
  const blockedKeys = new Set(
    (existing ?? [])
      .filter((row) => row.status !== 'pending_review')
      .map((row) => `${row.title}|${row.start_date}`)
  );
  const pendingByKey = new Map(
    (existing ?? [])
      .filter((row) => row.status === 'pending_review')
      .map((row) => [`${row.title}|${row.start_date}`, row.id as string])
  );

  const upcoming = CURATED_EVENTS.filter(
    (event) => event.endDate >= today && !blockedKeys.has(`${event.title}|${event.startDate}`)
  ).sort((a, b) => a.startDate.localeCompare(b.startDate));

  for (const event of upcoming) {
    if (activeCount >= MIN_ACTIVE_EVENTS) break;
    const key = `${event.title}|${event.startDate}`;
    const pendingId = pendingByKey.get(key);
    if (pendingId) {
      const { error } = await supabase
        .from('events')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', pendingId);
      if (error) {
        result.errors.push(`promote ${key}: ${error.message}`);
        continue;
      }
      result.promoted += 1;
      activeCount += 1;
      continue;
    }
    if (takenKeys.has(key)) continue; // pending без id в выборке — гонка, не дублируем
    const { error } = await supabase.from('events').insert({
      title: event.title,
      location: event.location,
      description: event.description,
      start_date: event.startDate,
      end_date: event.endDate,
      link: event.link,
      status: 'active',
      source: 'curated',
    });
    if (error) {
      // Уникальный конфликт (title, start_date) вставили другим путём между
      // чтением и записью; прочие ошибки — в отчёт прогона.
      result.errors.push(`insert ${key}: ${error.message}`);
      continue;
    }
    result.inserted += 1;
    activeCount += 1;
  }

  result.activeCount = activeCount;
  return result;
}

export const CURATED_EVENTS: CuratedEvent[] = [
  {
    title: 'Open Coffee Fest',
    location: 'Санкт-Петербург, Брусницын Холл',
    description:
      'Зимний открытый кофейный фестиваль: маркет обжарщиков и кофейных проектов со всей России, лекторий лидеров индустрии, чемпионат каптестеров. Вход свободный.',
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    link: 'https://opencoffeefest.ru',
  },
  {
    title: 'Фестиваль «ОГОНЁК»',
    location: 'Санкт-Петербург, Севкабель Порт',
    description:
      'Фестиваль кофе, чая и подарков: ярмарка независимых кофейных и гастро-проектов, главная сцена, дегустации. Открывает сезон Russian Coffee Cup 2027. Вход бесплатный.',
    startDate: '2026-12-13',
    endDate: '2026-12-14',
    link: 'https://vk.ru/ogonek_fest',
  },
  {
    title: 'World of Coffee Дубай',
    location: 'Дубай, Dubai World Trade Centre',
    description:
      'World of Coffee Middle East — профессиональная выставка спешелти-кофе: обжарщики, оборудование, чемпионаты World Coffee Championships.',
    startDate: '2027-01-26',
    endDate: '2027-01-28',
    link: 'https://dubai.worldofcoffee.org',
  },
  {
    title: 'African Fine Coffees Conference',
    location: 'Кампала, Уганда',
    description:
      'African Fine Coffees Conference & Exhibition — крупнейшая африканская конференция по кофе: торговля, каппинги, чемпионаты бариста и латте-арт Африки.',
    startDate: '2027-02-14',
    endDate: '2027-02-19',
    link: 'https://afca.coffee',
  },
  {
    title: 'India International Coffee Festival',
    location: 'Бангалор, Индия',
    description:
      'Международный фестиваль кофе Индии: выставка спешелти-кофе, национальные чемпионаты бариста и каптестеров, каппинги моносортов.',
    startDate: '2027-02-26',
    endDate: '2027-02-28',
    link: 'https://www.indiacoffeefestival.com',
  },
  {
    title: 'World of Coffee Новый Орлеан',
    location: 'Новый Орлеан, США',
    description:
      'World of Coffee USA — флагманская выставка Specialty Coffee Association в США: чемпионаты, лектории, оборудование и обжарка.',
    startDate: '2027-04-09',
    endDate: '2027-04-11',
    link: 'https://usa.worldofcoffee.org',
  },
  {
    title: 'CAFEX',
    location: 'Москва, Тимирязев Центр',
    description:
      'CAFEX (ex Coffee Tea Cacao Russian Expo) — профессиональная выставка кофе, чая и какао; в программе финал национального конкурса «Бариста Года».',
    startDate: '2027-04-14',
    endDate: '2027-04-16',
    link: 'https://coffeeteacacaoexpo.ru',
  },
  {
    title: 'World of Coffee Токио',
    location: 'Токио, Tokyo Big Sight',
    description:
      'World of Coffee Asia и чемпионат мира среди бариста (World Barista Championship): выставка спешелти-кофе и мировые финалы под одной крышей.',
    startDate: '2027-04-28',
    endDate: '2027-05-01',
    link: 'https://asia.worldofcoffee.org',
  },
];
