import { getUpcomingCoffeeEvents } from '@/lib/data/coffeeEvents';
import { formatDate } from '@/lib/utils/date';
import type { CoffeeEvent } from '@/lib/types/coffee';

function formatEventDates(event: CoffeeEvent): string {
  if (event.startDate === event.endDate) return formatDate(event.startDate);
  return `${formatDate(event.startDate)} — ${formatDate(event.endDate)}`;
}

export function EventsBoard() {
  const events = getUpcomingCoffeeEvents();

  if (events.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-ink-400 px-6 text-center">
        Ближайших мероприятий пока не анонсировано.
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto px-6 py-6">
      <div className="max-w-2xl mx-auto grid gap-4 sm:grid-cols-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-md border border-ink-200 bg-parchment-100 p-5">
            <p className="text-xs uppercase tracking-widest2 text-gold-500 mb-2">{formatEventDates(event)}</p>
            <h3 className="font-display text-lg text-ink-900 leading-tight mb-1">{event.title}</h3>
            <p className="text-sm text-ink-700 mb-3">
              {event.city}
              {event.location && ` · ${event.location}`}
            </p>
            {event.description && <p className="text-sm text-ink-500 mb-3">{event.description}</p>}
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
              >
                Подробнее →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
