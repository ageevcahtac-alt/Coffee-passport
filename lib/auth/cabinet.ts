import type { ProfileRole } from '@/lib/types/database';

// Кабинет каждой роли — куда ведут «Перейти в кабинет» на главной, пункт меню
// и вход с формы (app/auth/actions.ts). Энтузиаст — его дневник.
const CABINET: Record<ProfileRole, string> = {
  enthusiast: '/journey',
  admin: '/dashboard/admin',
  roaster_admin: '/dashboard/roaster',
  cafe_admin: '/dashboard/cafe',
  barista: '/dashboard/barista',
};

const STAFF_CABINET_LABEL: Partial<Record<ProfileRole, string>> = {
  admin: '🛠️ Кабинет администратора',
  roaster_admin: '🔥 Кабинет обжарщика',
  cafe_admin: '☕ Кабинет кофейни',
  barista: '🧑‍🍳 Кабинет бариста',
};

export function cabinetPathFor(role: ProfileRole): string {
  return CABINET[role] ?? CABINET.enthusiast;
}

export function isStaffRole(role: ProfileRole): boolean {
  return role !== 'enthusiast';
}

export type NavItem = { kind: 'link'; href: string; label: string } | { kind: 'signOut'; label: string; href?: undefined };

const SHARED: NavItem[] = [
  { kind: 'link', href: '/map', label: '🗺️ Карта кофеен' },
  { kind: 'link', href: '/recipes', label: '🏆 Топовые рецепты' },
];

// Пункты меню по состоянию входа. Без сессии — только общее: ни дневника,
// ни кабинетов (данные гостя в браузере меню не меняют). С сессией — пункты
// роли и «Выйти». `currentPath` — куда вернуть гостя после входа.
export function navItemsFor(session: { role: ProfileRole } | null, currentPath: string): NavItem[] {
  if (!session) {
    const next = encodeURIComponent(currentPath);
    return [
      ...SHARED,
      { kind: 'link', href: `/auth/login?next=${next}`, label: 'Войти' },
      { kind: 'link', href: `/auth/login?mode=signup&next=${next}`, label: 'Регистрация' },
      { kind: 'link', href: '/#partners', label: 'Для партнёров' },
    ];
  }
  const own: NavItem[] = isStaffRole(session.role)
    ? [{ kind: 'link', href: cabinetPathFor(session.role), label: STAFF_CABINET_LABEL[session.role] ?? 'Кабинет' }]
    : [
        { kind: 'link', href: '/journey', label: '🧳 Journey' },
        { kind: 'link', href: '/coffee-kitchen', label: '🍳 Coffee Kitchen' },
        { kind: 'link', href: '/loyalty', label: '💳 Мои карты' },
      ];
  return [...SHARED, ...own, { kind: 'signOut', label: 'Выйти' }];
}
