// Проверка ссылок мероприятий (пакет №4): «Мёртвых ссылок и заглушек быть
// не должно». Автоагрегатор валидирует каждый candidate.link перед записью —
// битая ссылка обнуляется (событие публикуется без ссылки, админ может
// дописать руками), мёртвая ссылка на витрину не попадает никогда.
// HEAD с падением на GET для серверов, которые HEAD не отдают (405/501)
// или режут его не-браузерным клиентам (403). Таймаут — чтобы один
// «зависший» хост не съел весь прогон крона.

const BOT_HEADERS = {
  'User-Agent': 'CoffeePassport-EventsBot/1.0 (+https://coffeepassport.ru)',
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
};

export async function isEventLinkAlive(url: string, timeoutMs = 8000): Promise<boolean> {
  if (!/^https?:\/\/\S+$/i.test(url)) return false;
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
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
