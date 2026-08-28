import type { Roaster } from '@/lib/types/coffee';

export const ROASTERS: Roaster[] = [
  {
    id: 'roaster-xo',
    name: 'XO COFFEE Roasting',
    slug: 'xo-coffee',
    color: '#D4AF37',
    philosophy: 'Прозрачная цепочка от фермера до чашки — у каждого лота есть имя и история.',
    city: 'Всеволожск',
    country: 'Россия',
  },
  {
    id: 'roaster-north',
    name: 'North Star Roasters',
    slug: 'north-star',
    color: '#5C6B4F',
    philosophy: 'Светлая обжарка, которая раскрывает терруар лота, а не прячет его под жаром.',
    city: 'Санкт-Петербург',
    country: 'Россия',
  },
];

export function getRoasterById(id: string): Roaster | undefined {
  return ROASTERS.find((roaster) => roaster.id === id);
}
