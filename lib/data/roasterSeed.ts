import type { Roaster } from '@/lib/types/coffee';

// Built-in roasters — plain data with no 'use client' directive so server
// routes (app/api/admin/partners) read the same cards the client store in
// roasters.ts starts from. Same split as coffeeShopSeed.ts.
export const SEED_ROASTERS: Roaster[] = [
  {
    id: 'roaster-xo',
    name: 'XO COFFEE Roasting',
    slug: 'xo-coffee',
    color: '#D4AF37',
    philosophy: 'Прозрачная цепочка от фермера до чашки — у каждого лота есть имя и история.',
    city: 'Всеволожск',
    country: 'Россия',
    status: 'active',
  },
  {
    id: 'roaster-north',
    name: 'North Star Roasters',
    slug: 'north-star',
    color: '#5C6B4F',
    philosophy: 'Светлая обжарка, которая раскрывает терруар лота, а не прячет его под жаром.',
    city: 'Санкт-Петербург',
    country: 'Россия',
    status: 'active',
  },
];
