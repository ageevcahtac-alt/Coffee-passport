import { describe, expect, it } from 'vitest';
import { cabinetPathFor, navItemsFor } from './cabinet';

const CABINETS = {
  enthusiast: '/journey',
  roaster_admin: '/dashboard/roaster',
  cafe_admin: '/dashboard/cafe',
  barista: '/dashboard/barista',
  admin: '/dashboard/admin',
} as const;

const PERSONAL = /^\/(journey|coffee-kitchen|loyalty|dashboard)/;

describe('cabinetPathFor', () => {
  for (const [role, path] of Object.entries(CABINETS)) {
    it(`${role} → ${path}`, () => {
      expect(cabinetPathFor(role as keyof typeof CABINETS)).toBe(path);
    });
  }
});

describe('navItemsFor', () => {
  it('guest: only the shared items, nothing personal', () => {
    const items = navItemsFor(null, '/passport/lot-1');
    expect(items.map((item) => item.label)).toEqual([
      '🗺️ Карта кофеен',
      '🏆 Топовые рецепты',
      'Войти',
      'Регистрация',
      'Для партнёров',
    ]);
    expect(items.filter((item) => item.href && PERSONAL.test(item.href))).toEqual([]);
    expect(items.some((item) => item.kind === 'signOut')).toBe(false);
    // «Войти» и «Регистрация» возвращают туда, где гость был.
    expect(items[2].href).toBe('/auth/login?next=%2Fpassport%2Flot-1');
    expect(items[3].href).toBe('/auth/login?mode=signup&next=%2Fpassport%2Flot-1');
    expect(items[4].href).toBe('/#partners');
  });

  it('enthusiast: diary items and «Выйти», no staff cabinet', () => {
    const items = navItemsFor({ role: 'enthusiast' }, '/');
    const hrefs = items.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/journey', '/coffee-kitchen', '/loyalty']));
    expect(hrefs.some((href) => href?.startsWith('/dashboard'))).toBe(false);
    expect(hrefs.some((href) => href?.startsWith('/auth/login'))).toBe(false);
    expect(items.at(-1)).toEqual({ kind: 'signOut', label: 'Выйти' });
  });

  for (const role of ['roaster_admin', 'cafe_admin', 'barista', 'admin'] as const) {
    it(`${role}: own cabinet and «Выйти», no enthusiast diary or login`, () => {
      const items = navItemsFor({ role }, '/');
      const hrefs = items.map((item) => item.href);
      expect(hrefs).toContain(CABINETS[role]);
      expect(hrefs.filter((href) => href && PERSONAL.test(href))).toEqual([CABINETS[role]]);
      expect(hrefs.some((href) => href?.startsWith('/auth/login'))).toBe(false);
      expect(items.at(-1)).toEqual({ kind: 'signOut', label: 'Выйти' });
    });
  }
});
