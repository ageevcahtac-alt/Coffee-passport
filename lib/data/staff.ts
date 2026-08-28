import type { StaffMember } from '@/lib/types/coffee';

// Seeded for the pilot shop (shop-xo-vsevolozhsk) only, mirroring how
// cafeMenuStore seeds a starter menu for the same shop. The three barista
// entries intentionally reuse the ids from lib/data/baristas.ts so their
// guest ratings (TastingRecord.baristaId/baristaRating/baristaNote) show up
// on these staff cards without duplicating data.
export const STAFF: StaffMember[] = [
  {
    id: 'barista-xo-alexey',
    shopId: 'shop-xo-vsevolozhsk',
    name: 'Алексей',
    role: 'barista',
    hireDate: '2023-04-10',
    achievements: 'Победитель внутреннего латте-арт баттла XO Coffee, 2024.',
    hobbies: 'Сноуборд, домашняя обжарка на семплере.',
    leadershipQualities: 'Легко обучает новичков, берёт на себя открытие смены.',
    managerNote: 'Опорный бариста утренней смены — спокойный, дотошный к рецептуре.',
  },
  {
    id: 'barista-xo-maria',
    shopId: 'shop-xo-vsevolozhsk',
    name: 'Мария',
    role: 'barista',
    hireDate: '2023-09-01',
    achievements: 'Сертификат SCA Barista Skills Foundation.',
    hobbies: 'Бег, фотография на плёнку.',
    leadershipQualities: 'Хорошо гасит конфликтные ситуации с гостями.',
    managerNote: 'Лучший контакт с постоянными гостями — помнит их заказы.',
  },
  {
    id: 'barista-xo-dmitry',
    shopId: 'shop-xo-vsevolozhsk',
    name: 'Дмитрий',
    role: 'barista',
    hireDate: '2024-02-15',
    achievements: '',
    hobbies: 'Настольные игры, велоспорт.',
    leadershipQualities: '',
    managerNote: 'Новичок, растёт быстро — стоит присмотреться к развитию.',
  },
  {
    id: 'staff-xo-olga',
    shopId: 'shop-xo-vsevolozhsk',
    name: 'Ольга',
    role: 'confectioner',
    hireDate: '2022-11-20',
    achievements: 'Разработала сезонную линейку десертов — +18% к среднему чеку выпечки.',
    hobbies: 'Керамика, походы.',
    leadershipQualities: 'Держит стандарт качества без напоминаний.',
    managerNote: 'Полностью самостоятельна, можно делегировать закупку сырья.',
  },
  {
    id: 'staff-xo-igor',
    shopId: 'shop-xo-vsevolozhsk',
    name: 'Игорь',
    role: 'cook',
    hireDate: '2023-06-05',
    achievements: '',
    hobbies: 'Рыбалка, гриль.',
    leadershipQualities: '',
    managerNote: 'Держит кухню в порядке, хорошо работает под нагрузкой в выходные.',
  },
  {
    id: 'staff-xo-svetlana',
    shopId: 'shop-xo-vsevolozhsk',
    name: 'Светлана',
    role: 'administrator',
    hireDate: '2023-01-12',
    achievements: 'Выстроила систему учёта смен и инвентаря.',
    hobbies: 'Йога, книги по менеджменту.',
    leadershipQualities: 'Умеет распределять задачи между сменами.',
    managerNote: 'Правая рука управляющего, готова к росту.',
  },
  {
    id: 'staff-xo-natalya',
    shopId: 'shop-xo-vsevolozhsk',
    name: 'Наталья',
    role: 'manager',
    hireDate: '2021-08-01',
    achievements: 'Открыла точку с нуля, вывела на плановую выручку за 3 месяца.',
    hobbies: 'Путешествия, кулинарные курсы.',
    leadershipQualities: 'Сильный переговорщик, умеет удерживать команду.',
    managerNote: 'Управляющий точки — согласование по кадровым вопросам через неё.',
  },
];

export function getStaffById(id: string): StaffMember | undefined {
  return STAFF.find((member) => member.id === id);
}
