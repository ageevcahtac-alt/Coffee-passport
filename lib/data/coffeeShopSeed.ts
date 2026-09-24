import type { CoffeeShop } from '@/lib/types/coffee';

// Seed coffee shops — plain data with no 'use client' directive so server
// code (the roastery-order API routes, which resolve the signed-in shop's
// name from profiles.cafe_id) can read the same canonical records the
// client store below starts from. Moved verbatim out of coffeeShops.ts.
export const SEED_COFFEE_SHOPS: CoffeeShop[] = [
  {
    id: 'shop-xo-vsevolozhsk',
    name: 'XO Coffee',
    city: 'Всеволожск',
    brandColor: '#D4AF37',
    lat: 60.0167,
    lng: 30.6394,
    address: 'г. Всеволожск, Колтушское шоссе, 1',
    phone: '+7 800 555-01-01',
    website: 'https://xo-coffee.example',
    instagramUrl: '',
    telegramUrl: '',
    vkUrl: '',
    description: 'Пилотная кофейня программы Coffee Passport — зерно от нескольких обжарщиков, фильтр и эспрессо.',
    workingHours: 'Пн–Вс 8:00–20:00',
    photos: [],
  },
  {
    id: 'shop-a-spb',
    name: 'Coffee Shop A',
    city: 'Санкт-Петербург',
    brandColor: '#00A896',
    lat: 59.9311,
    lng: 30.3609,
    address: '',
    phone: '',
    website: '',
    instagramUrl: '',
    telegramUrl: '',
    vkUrl: '',
    description: '',
    workingHours: '',
    photos: [],
  },
  {
    id: 'shop-b-peterhof',
    name: 'Coffee Shop B',
    city: 'Петергоф',
    brandColor: '#E63946',
    lat: 59.8848,
    lng: 29.9099,
    address: '',
    phone: '',
    website: '',
    instagramUrl: '',
    telegramUrl: '',
    vkUrl: '',
    description: '',
    workingHours: '',
    photos: [],
  },
];
