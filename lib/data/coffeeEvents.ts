import type { CoffeeEvent } from '@/lib/types/coffee';

// Coffee industry events shown on /map's "Ближайшие мероприятия" tab.
// Hardcoded seed list — no backend/CMS yet, same idiom as the rest of
// lib/data. Update dates/entries by hand as events are announced.
export const COFFEE_EVENTS: CoffeeEvent[] = [
  {
    id: 'pir-coffee-2026',
    title: 'PIR Coffee',
    startDate: '2026-10-13',
    endDate: '2026-10-15',
    city: 'Москва',
    location: 'Крокус Экспо',
    description: 'Специализированная выставка кофейной индустрии в составе PIR Expo — обжарщики, оборудование, бариста-чемпионаты.',
    url: 'https://pirexpo.com',
  },
  {
    id: 'pir-expo-2026',
    title: 'PIR Expo',
    startDate: '2026-10-13',
    endDate: '2026-10-16',
    city: 'Москва',
    location: 'Крокус Экспо',
    description: 'Международная выставка индустрии гостеприимства — HoReCa, кофе и рестораны под одной крышей.',
    url: 'https://pirexpo.com',
  },
  {
    id: 'coffee-fest-spb-2026',
    title: 'Coffee Fest',
    startDate: '2026-11-21',
    endDate: '2026-11-22',
    city: 'Санкт-Петербург',
    location: 'Севкабель Порт',
    description: 'Городской кофейный фестиваль — локальные обжарщики, воркшопы для бариста и энтузиастов, каппинги.',
    url: '',
  },
  {
    id: 'world-of-coffee-2027',
    title: 'World of Coffee',
    startDate: '2027-02-19',
    endDate: '2027-02-21',
    city: 'Милан',
    location: 'Fiera Milano',
    description: 'Флагманское европейское событие Специализированной ассоциации кофе (SCA) — чемпионаты бариста, обжарщики со всего мира.',
    url: 'https://worldofcoffee.org',
  },
];

export function getUpcomingCoffeeEvents(fromDate: Date = new Date()): CoffeeEvent[] {
  const cutoff = fromDate.getTime();
  return COFFEE_EVENTS
    .filter((event) => new Date(event.endDate).getTime() >= cutoff)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}
