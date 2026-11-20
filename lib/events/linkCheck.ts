// Проверка ссылок мероприятий (пакет №4): «Мёртвых ссылок и заглушек быть
// не должно». Три состояния вместо булева — разница между «сервер ответил
// 404» и «сеть молчит/таймаут» критична для ежедневного крона, который
// ОБНУЛЯЕТ ссылки: временную сетевую ошибку нельзя превращать в
// безвозвратную потерю рабочей ссылки (Codex review, пакет №4 round 1,
// finding 1). HEAD с падением на GET для серверов, которые HEAD не отдают
// (405/501) или режут ботов (403). Таймаут — чтобы один «зависший» хост не
// съел весь прогон.
//
// Политика применения:
// - ingestion (events-aggregate): 'ok' → ссылка остаётся; 'dead'/'unknown'
//   → обнуляем — непроверенная ссылка на витрину не попадает никогда;
// - re-check публичных строк (events-archive): 'dead' → обнуляем; 'unknown'
//   → оставляем как есть, перепроверим завтра (сайт может просто лежать).

const BOT_HEADERS = {
  'User-Agent': 'CoffeePassport-EventsBot/1.0 (+https://coffeepassport.ru)',
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
};

export type EventLinkStatus = 'ok' | 'dead' | 'unknown';

export async function checkEventLink(url: string, timeoutMs = 8000): Promise<EventLinkStatus> {
  if (!/^https?:\/\/\S+$/i.test(url)) return 'dead';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: BOT_HEADERS,
    });
    if (response.status === 405 || response.status === 501 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: BOT_HEADERS,
      });
    }
    if (response.ok) return 'ok';
    // 404/410/451 — исчерпывающе мёртво; прочие 4xx/5xx (500, 429, …) могут
    // быть временными — не трогаем опубликованное по одному плохому дню.
    return response.status === 404 || response.status === 410 || response.status === 451 ? 'dead' : 'unknown';
  } catch {
    // Сеть/таймаут/DNS — не диагноз ссылки.
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}
